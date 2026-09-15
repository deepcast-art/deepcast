#!/usr/bin/env node
/**
 * measure-playback.mjs — instrument the watch page's player and classify
 * playback stalls (Phase 1b, 2026-09-15).
 *
 * Headed chromium (the founder's symptom is desktop Chrome). For each run it
 * opens a watch page, clicks play MUTED, plays for N seconds and records:
 *   - every `waiting` / `stalled` media event with currentTime and the
 *     buffer-ahead at that instant;
 *   - buffer-ahead seconds, hls level, bandwidth estimate and dropped
 *     frames sampled every 2 s;
 *   - every hls.js LEVEL_SWITCHED;
 *   - every PerformanceObserver `longtask` entry > 50 ms.
 * Then prints one table per run and a classification per stall:
 *   (A) buffer-ahead ≈ 0 at the stall → rebuffering / ABR;
 *   (B) buffer healthy but dropped frames climb or a long task coincides →
 *       render / main thread;
 *   (C) neither.
 *
 * MODES
 *   default (mock): a LOCAL Vite dev server (`npm run dev:client`, port
 *     3000) serves the real ClaimWatch page; the link route is answered by a
 *     Playwright route mock carrying the REAL public playback id, and the
 *     claim stash is seeded in localStorage. Nothing is claimed, minted, or
 *     written anywhere — the only network traffic that leaves the machine is
 *     the public Mux stream (and its analytics beacons, which are answered
 *     locally with a 204).
 *   --url <watch page>: open a real page instead — ONLY the founder's film-mode
 *     watch page (/watch/film/{filmId}, in a browser profile that is already
 *     signed in — pass --profile <dir>); the script refuses any other URL,
 *     because a real slug page would mark that ticket watched at 70 %. Never a
 *     landing page; this script never claims or mints. Note that a real
 *     profile's resume position for that film is rewritten by the app as it
 *     plays. Each default invocation streams ~0.6–0.8 GB of the live asset
 *     from Mux (delivery minutes); Mux Data views are not recorded (the
 *     beacons are answered locally).
 *
 * USAGE
 *   node scripts/measure-playback.mjs                      # 3 runs × 180 s
 *   node scripts/measure-playback.mjs --runs 1 --seconds 60
 *   node scripts/measure-playback.mjs --base http://localhost:3000
 *   node scripts/measure-playback.mjs --playback-id <id>
 *   node scripts/measure-playback.mjs --json out.json     # also write raw samples
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const RUNS = Number(opt('runs', 3))
const SECONDS = Number(opt('seconds', 180))
const BASE = opt('base', 'http://localhost:3000')
const URL_OVERRIDE = opt('url', null)
// A real SLUG watch page writes `status='watched'` through the app at 70 % of
// the film (ClaimWatch's handleTimeUpdate) — a real ticket would be marked
// watched by a measurement. Only the filmmaker's own film-mode page is
// allowed as a real target (it holds no invite row, so nothing is written).
if (URL_OVERRIDE && !/\/watch\/film\//.test(URL_OVERRIDE)) {
  console.error('--url must be a film-mode watch page (/watch/film/{filmId}); a slug page would mark a real ticket watched. Refusing.')
  process.exit(2)
}
const PROFILE = opt('profile', null)
const JSON_OUT = opt('json', null)
const WIDTH = Number(opt('width', 1440))
const HEIGHT = Number(opt('height', 900))
// Circles' live third cut (public playback id; CLAUDE.md, Films section).
const PLAYBACK_ID = opt('playback-id', 'QDUEUyF7WDjjsOtMfeVfqh6M2NVM02arzLHK3IJnwYC00')
// The founder's symptom is in desktop Chrome, so the default is the installed
// Google Chrome (`--channel chrome`); pass `--channel chromium` for
// Playwright's own build (needs the matching revision installed).
const CHANNEL = opt('channel', 'chrome')
// Optional CDP network emulation (kbps down, ms latency) — the founder's
// connection is not this machine's; `--throttle 6000 --latency 40` puts the
// stream just under the 7 Mbps top rendition, where ABR has to choose.
const THROTTLE_KBPS = Number(opt('throttle', 0))
const LATENCY_MS = Number(opt('latency', 0))
// `--burst hi,lo,seconds` alternates the throttle between two rates every N
// seconds (a residential connection's variance — a constant rate never
// starves a rendition, a bursty one does).
const BURST = opt('burst', null)?.split(',').map(Number) ?? null
// The founder's desktop is a Retina Mac: at DPR 2 the player's 744 CSS px
// count as 1488 device px and `capLevelToPlayerSize` admits the 1080p
// renditions; at DPR 1 the cap holds the player at 720p, whatever the
// bandwidth (measured 2026-09-15: 720p at 130 Mbps).
const DPR = Number(opt('dpr', 2))
const SLUG = 'ticket-measr'

const LINK_PAYLOAD = {
  inviteeFirstName: 'Measure',
  sharerName: 'Ien Chi',
  filmTitle: 'Circles (measurement double)',
  transmissionHook: null,
  status: 'claimed',
  inviteOrdinal: 1,
  lineageNames: ['Ien Chi'],
  senderIsCreator: true,
  posterUrl: null,
  muxPlaybackId: PLAYBACK_ID,
  inviteId: 'inv-measure',
  filmId: 'film-measure',
  claimOrdinal: 1,
  ticketNo: 2,
  ticketsRemaining: 5,
  durationSeconds: 1803.135633,
  filmSharesCount: 1,
  filmClaimsCount: 1,
  lineageForks: [false],
  onward: [],
}

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—')
const pad = (s, w) => String(s).padEnd(w)

/** Runs in the page: hooks the player and collects everything into window.__pb. */
function instrument() {
  const mp = document.querySelector('mux-player')
  if (!mp) return { ok: false, why: 'no <mux-player>' }
  const media = mp.media
  const video = media?.nativeEl
  const hls = media?._hls
  if (!video) return { ok: false, why: 'no native video element yet' }
  const t0 = performance.now()
  const log = { events: [], samples: [], levels: [], longTasks: [], config: null, ok: true }
  window.__pb = log
  const bufferAhead = () => {
    const b = video.buffered
    const t = video.currentTime
    for (let i = 0; i < b.length; i++) {
      if (b.start(i) <= t + 0.05 && b.end(i) >= t) return b.end(i) - t
    }
    return 0
  }
  const dropped = () => {
    try {
      return video.getVideoPlaybackQuality().droppedVideoFrames
    } catch {
      return null
    }
  }
  const at = () => Math.round(performance.now() - t0)
  for (const type of ['waiting', 'stalled', 'playing', 'seeking', 'pause']) {
    video.addEventListener(type, () => {
      log.events.push({
        at: at(),
        type,
        currentTime: video.currentTime,
        bufferAhead: bufferAhead(),
        dropped: dropped(),
        readyState: video.readyState,
        level: hls?.currentLevel ?? null,
      })
    })
  }
  if (hls) {
    const c = hls.config
    log.config = {
      hlsVersion: hls.constructor?.version ?? null,
      maxBufferLength: c.maxBufferLength,
      maxMaxBufferLength: c.maxMaxBufferLength,
      maxBufferSize: c.maxBufferSize,
      backBufferLength: c.backBufferLength,
      lowLatencyMode: c.lowLatencyMode,
      capLevelToPlayerSize: c.capLevelToPlayerSize,
      abrEwmaDefaultEstimate: c.abrEwmaDefaultEstimate,
      abrBandWidthUpFactor: c.abrBandWidthUpFactor,
      abrBandWidthFactor: c.abrBandWidthFactor,
      startLevel: c.startLevel,
      preload: video.preload,
      levels: (hls.levels || []).map((l) => `${l.height}p@${Math.round(l.bitrate / 1000)}k`),
    }
    hls.on('hlsLevelSwitched', (_e, data) => {
      const l = hls.levels?.[data.level]
      log.levels.push({
        at: at(),
        currentTime: video.currentTime,
        level: data.level,
        label: l ? `${l.height}p@${Math.round(l.bitrate / 1000)}k` : String(data.level),
        bandwidthEstimate: hls.bandwidthEstimate,
      })
    })
  } else {
    log.config = { preload: video.preload, hls: 'none (native playback)' }
  }
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration > 50) log.longTasks.push({ at: Math.round(e.startTime - t0), duration: Math.round(e.duration), currentTime: video.currentTime })
      }
    })
    po.observe({ entryTypes: ['longtask'] })
  } catch {
    /* longtask unsupported */
  }
  log.timer = setInterval(() => {
    log.samples.push({
      at: at(),
      currentTime: video.currentTime,
      bufferAhead: bufferAhead(),
      dropped: dropped(),
      level: hls?.currentLevel ?? null,
      bandwidthEstimate: hls?.bandwidthEstimate ?? null,
      paused: video.paused,
    })
  }, 2000)
  return { ok: true, hasHls: !!hls }
}

function classify(run) {
  const stalls = run.events.filter((e) => e.type === 'waiting' || e.type === 'stalled')
  // A `waiting` fired at the very first play (before any buffer) is the
  // start-up, not a mid-play stall: keep it, but flag it.
  const rows = stalls.map((s) => {
    const before = run.samples.filter((x) => x.at <= s.at).slice(-1)[0]
    const after = run.samples.find((x) => x.at > s.at)
    const droppedDelta = before && after && before.dropped != null && after.dropped != null ? after.dropped - before.dropped : null
    const nearLong = run.longTasks.filter((l) => Math.abs(l.at - s.at) <= 1500)
    const nearSwitch = run.levels.filter((l) => Math.abs(l.at - s.at) <= 3000)
    const sampleLevel = before?.level
    let cls
    if (s.bufferAhead < 0.5) cls = 'A (buffer empty)'
    else if ((droppedDelta ?? 0) > 5 || nearLong.length) cls = 'B (render/main-thread)'
    else cls = 'C (neither)'
    return { ...s, level: s.level ?? sampleLevel, droppedDelta, nearLong, nearSwitch, cls, startup: s.currentTime < 0.5 }
  })
  return rows
}

function printRun(i, run) {
  if (run.lost) {
    console.log(`\n═══ Run ${i + 1} — LOST (page reloaded mid-run) ═══`)
    return { stalls: '—', midPlay: '—', minAhead: NaN, dropped: null, longTasks: '—', switches: '—' }
  }
  console.log(`\n═══ Run ${i + 1} — ${SECONDS}s, muted, ${WIDTH}×${HEIGHT}, DPR ${DPR}${THROTTLE_KBPS ? `, throttled ${THROTTLE_KBPS} kbps / ${LATENCY_MS} ms` : ''}${BURST ? `, bursty ${BURST[0]}/${BURST[1]} kbps every ${BURST[2]} s / ${LATENCY_MS} ms` : ''} ═══`)
  console.log('hls config in effect (pre-play):', JSON.stringify(run.config))
  if (run.configAfterPlay) console.log('buffer config after play:', JSON.stringify(run.configAfterPlay))
  const rows = classify(run)
  const midPlay = rows.filter((r) => !r.startup)
  console.log(`stall events (waiting/stalled): ${rows.length} total, ${midPlay.length} mid-play (currentTime ≥ 0.5s)`)
  if (rows.length) {
    console.log(pad('at(ms)', 9) + pad('event', 9) + pad('t(s)', 9) + pad('ahead(s)', 10) + pad('lvl', 5) + pad('Δdropped', 10) + pad('longtask', 12) + pad('lvl-switch±3s', 22) + 'class')
    for (const r of rows) {
      console.log(
        pad(r.at, 9) +
          pad(r.type, 9) +
          pad(fmt(r.currentTime), 9) +
          pad(fmt(r.bufferAhead), 10) +
          pad(r.level ?? '—', 5) +
          pad(r.droppedDelta ?? '—', 10) +
          pad(r.nearLong.map((l) => `${l.duration}ms`).join(',') || '—', 12) +
          pad(r.nearSwitch.map((l) => l.label).join(',') || '—', 22) +
          r.cls +
          (r.startup ? '  [start-up]' : '')
      )
    }
  }
  const levelsSeen = [...new Set(run.samples.map((x) => x.level))].map((l) => run.config?.levels?.[l] ?? l)
  console.log(`levels played: ${levelsSeen.join(', ')}; bandwidth estimate first/last: ${fmt((run.samples[0]?.bandwidthEstimate ?? NaN) / 1e6)} / ${fmt((run.samples.at(-1)?.bandwidthEstimate ?? NaN) / 1e6)} Mbps`)
  console.log(`level switches: ${run.levels.length}` + (run.levels.length ? ' → ' + run.levels.map((l) => `${fmt(l.currentTime, 1)}s:${l.label}`).join('  ') : ''))
  console.log(`long tasks >50ms: ${run.longTasks.length}` + (run.longTasks.length ? ' → ' + run.longTasks.map((l) => `${l.duration}ms@${fmt(l.currentTime, 1)}s`).join('  ') : ''))
  const ahead = run.samples.map((s) => s.bufferAhead)
  const minAhead = Math.min(...ahead.slice(2))
  const last = run.samples.at(-1)
  console.log(
    `buffer-ahead: min ${fmt(minAhead)}s (after the first 4s), final ${fmt(last?.bufferAhead)}s; dropped frames total ${last?.dropped ?? '—'}; reached ${fmt(last?.currentTime, 1)}s of film`
  )
  if (run.navigations?.length) console.log('page events during the run: ' + JSON.stringify(run.navigations))
  console.log('buffer-ahead every 10s: ' + run.samples.filter((_, k) => k % 5 === 0).map((s) => `${fmt(s.currentTime, 0)}s:${fmt(s.bufferAhead, 0)}`).join(' '))
  return { stalls: rows.length, midPlay: midPlay.length, minAhead, dropped: last?.dropped ?? null, longTasks: run.longTasks.length, switches: run.levels.length }
}

async function measureOnce(browser, i) {
  const context = PROFILE ? browser : await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR })
  const page = await context.newPage()
  await page.route('**/*.litix.io/**', (route) =>
    route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
  )
  let burstTimer = null
  if (THROTTLE_KBPS > 0 || BURST) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    const setRate = (kbps) =>
      cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: LATENCY_MS,
        downloadThroughput: (kbps * 1000) / 8,
        uploadThroughput: (kbps * 1000) / 8,
      })
    if (BURST) {
      const [hi, lo, period] = BURST
      let high = true
      await setRate(hi)
      burstTimer = setInterval(() => {
        high = !high
        setRate(high ? hi : lo).catch(() => {})
      }, period * 1000)
    } else {
      await setRate(THROTTLE_KBPS)
    }
  }
  let url = URL_OVERRIDE
  if (!url) {
    await page.addInitScript(
      ([slug]) => {
        window.localStorage.setItem(
          'deepcast:claim',
          JSON.stringify({ slug, inviteId: 'inv-measure', filmId: 'film-measure', claimedEmail: 'measure@example.invalid' })
        )
      },
      [SLUG]
    )
    await page.route('**/api/invites/link/**', (route) => route.fulfill({ json: LINK_PAYLOAD }))
    await page.route('**/api/films/**/comments', (route) => route.fulfill({ status: 403, json: { error: 'no' } }))
    url = `${BASE}/watch/${SLUG}`
  }
  // A page that reloads or navigates mid-run loses its log — record it so a
  // run can say "the page reloaded at 61 s" instead of crashing.
  const navigations = []
  const runStart = Date.now()
  page.on('load', () => navigations.push({ at: Date.now() - runStart, url: page.url() }))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') navigations.push({ at: Date.now() - runStart, console: `${m.type()}: ${m.text().slice(0, 200)}` })
  })
  page.on('pageerror', (e) => navigations.push({ at: Date.now() - runStart, pageerror: String(e.message).slice(0, 200) }))
  await page.goto(url)
  await page.waitForSelector('mux-player', { timeout: 30_000 })
  // Wait for the native video element inside the shadow root.
  await page.waitForFunction(() => !!document.querySelector('mux-player')?.media?.nativeEl, null, { timeout: 30_000 })
  // Give the page the same idle a reader would (the founder reads 10–60 s
  // before pressing play); 8 s is enough to see whether anything buffers.
  await page.waitForTimeout(8000)
  const inst = await page.evaluate(instrument)
  if (!inst.ok) throw new Error(`instrument failed: ${inst.why}`)
  const preBuffer = await page.evaluate(() => {
    const v = document.querySelector('mux-player').media.nativeEl
    const b = v.buffered
    return b.length ? b.end(b.length - 1) - v.currentTime : 0
  })
  await page.evaluate(() => {
    const mp = document.querySelector('mux-player')
    mp.muted = true
    return mp.play()
  })
  await page.waitForTimeout(SECONDS * 1000)
  if (burstTimer) clearInterval(burstTimer)
  const alive = await page.evaluate(() => !!window.__pb)
  if (!alive) {
    console.log(`run ${i + 1}: the page RELOADED or NAVIGATED mid-run — log lost. Events: ${JSON.stringify(navigations)}`)
    if (!PROFILE) await context.close()
    else await page.close()
    return { events: [], samples: [], levels: [], longTasks: [], config: null, lost: true, navigations }
  }
  const run = await page.evaluate(() => {
    clearInterval(window.__pb.timer)
    const { timer: _t, ...rest } = window.__pb
    // The config AFTER play: mux's preload="metadata" handling caps the
    // buffer at 1 s until the first play, then restores the real values.
    const hls = document.querySelector('mux-player').media._hls
    if (hls) rest.configAfterPlay = { maxBufferLength: hls.config.maxBufferLength, maxBufferSize: hls.config.maxBufferSize, maxMaxBufferLength: hls.config.maxMaxBufferLength }
    return rest
  })
  run.preBufferAhead = preBuffer
  run.navigations = navigations.slice(1) // [0] is the initial load
  if (!PROFILE) await context.close()
  else await page.close()
  console.log(`run ${i + 1}: buffer-ahead before play (after 8 s on the page): ${fmt(preBuffer)}s`)
  return run
}

const launchOptions = {
  headless: false,
  args: ['--autoplay-policy=no-user-gesture-required'],
  ...(CHANNEL === 'chromium' ? {} : { channel: CHANNEL }),
}
const browser = PROFILE
  ? await chromium.launchPersistentContext(PROFILE, { ...launchOptions, viewport: { width: WIDTH, height: HEIGHT } })
  : await chromium.launch(launchOptions)

console.log(`measure-playback (${CHANNEL}, ${browser.version?.() ?? ''}): ${RUNS} run(s) × ${SECONDS}s, ${URL_OVERRIDE ? `url ${URL_OVERRIDE}` : `mock page at ${BASE}/watch/${SLUG}, playback ${PLAYBACK_ID}`}`)
const runs = []
const summaries = []
for (let i = 0; i < RUNS; i++) {
  const run = await measureOnce(browser, i)
  runs.push(run)
  summaries.push(printRun(i, run))
}
await browser.close()

console.log('\n═══ Summary ═══')
console.log(pad('run', 5) + pad('stalls', 8) + pad('mid-play', 10) + pad('min ahead(s)', 14) + pad('dropped', 9) + pad('longtasks', 11) + 'switches')
summaries.forEach((s, i) =>
  console.log(pad(i + 1, 5) + pad(s.stalls, 8) + pad(s.midPlay, 10) + pad(fmt(s.minAhead), 14) + pad(s.dropped ?? '—', 9) + pad(s.longTasks, 11) + s.switches)
)
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ runs, summaries, seconds: SECONDS, playbackId: PLAYBACK_ID }, null, 2))
  console.log(`raw samples written to ${JSON_OUT}`)
}
