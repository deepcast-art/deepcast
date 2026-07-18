/**
 * One-time backfill: film runtimes from Mux → films.duration_seconds
 * (invite-v2 landing page, 2026-07-18).
 *
 * For every film whose duration_seconds is NULL, fetch the asset's duration
 * from Mux ONCE and write it into our own database. From then on every page
 * reads the database — Mux is never called at page-view time. Films whose
 * mux_asset_id is missing (e.g. the seeded demo film) resolve their asset
 * through the playback id.
 *
 * SAFETY (house rules):
 *   - DRY-RUN BY DEFAULT; --execute requires typing the confirmation phrase.
 *   - FILL-ONLY: touches ONLY films.duration_seconds, and ONLY rows where it
 *     is NULL — an existing value is never overwritten, nothing is deleted,
 *     no other table or column is read for writing. (No user rows are
 *     involved at all; the protected-emails rule is satisfied vacuously.)
 *   - THE OWNER runs --execute personally.
 */
import 'dotenv/config'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'
import Mux from '@mux/mux-node'

const EXECUTE = process.argv.includes('--execute')
const CONFIRM_PHRASE = 'BACKFILL FILM DURATIONS'

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env')
if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET)
  fail('MUX_TOKEN_ID / MUX_TOKEN_SECRET missing from .env')

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
})

async function resolveAsset(film) {
  // Preferred: the stored asset id. Fallback (seeded films): look the asset
  // up from the playback id — a read-only Mux call either way.
  if (film.mux_asset_id) {
    return { asset: await mux.video.assets.retrieve(film.mux_asset_id), via: 'asset id' }
  }
  if (film.mux_playback_id) {
    const pb = await mux.video.playbackIds.retrieve(film.mux_playback_id)
    if (pb?.object?.type === 'asset' && pb.object.id) {
      return { asset: await mux.video.assets.retrieve(pb.object.id), via: 'playback id' }
    }
  }
  return { asset: null, via: null }
}

async function main() {
  const { data: films, error } = await supabase
    .from('films')
    .select('id, title, mux_asset_id, mux_playback_id, duration_seconds')
    .order('created_at', { ascending: true })
  if (error) fail(error.message)

  const plans = []
  const skips = []
  for (const film of films || []) {
    if (film.duration_seconds != null) {
      skips.push(`  ${film.title}: already has duration_seconds=${film.duration_seconds} — untouched`)
      continue
    }
    try {
      const { asset, via } = await resolveAsset(film)
      if (!asset) {
        skips.push(`  ${film.title}: no Mux asset or playback id on record — skipped`)
        continue
      }
      if (asset.status !== 'ready' || asset.duration == null) {
        skips.push(`  ${film.title}: Mux asset not ready / no duration (status=${asset.status}) — skipped`)
        continue
      }
      plans.push({ film, duration: asset.duration, via })
    } catch (err) {
      skips.push(`  ${film.title}: Mux lookup failed (${err?.message || err}) — skipped`)
    }
  }

  console.log(
    `\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} — ${plans.length} film(s) would get a duration (fill-only, existing values untouched):\n`
  )
  for (const p of plans) {
    const mins = Math.max(1, Math.floor(p.duration / 60))
    console.log(
      `  ${p.film.title} (${p.film.id})\n` +
        `    → duration_seconds = ${p.duration} (≈ ${mins} minute${mins === 1 ? '' : 's'} displayed; resolved via ${p.via})`
    )
  }
  if (!plans.length) console.log('  (nothing to do)')
  if (skips.length) console.log(`\nSkipped:\n${skips.join('\n')}`)

  if (!EXECUTE) {
    console.log('\nDry run only — nothing written. Re-run with --execute to apply (owner only).')
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to write the ${plans.length} duration(s) above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  let done = 0
  for (const p of plans) {
    // Fill-only, re-checked at write time: only a still-NULL row is updated.
    const { error: upErr } = await supabase
      .from('films')
      .update({ duration_seconds: p.duration })
      .eq('id', p.film.id)
      .is('duration_seconds', null)
    if (upErr) {
      console.error(`  ✗ ${p.film.title}: ${upErr.message}`)
      continue
    }
    done += 1
  }
  console.log(`\nDone — ${done}/${plans.length} film duration(s) written.`)
}

main().catch((err) => fail(err?.message || String(err)))
