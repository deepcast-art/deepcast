/**
 * Demo-film teardown — removes EVERYTHING server/seed-demo-film.js created, and
 * nothing else. Scoped to a single, unambiguously-identified demo film.
 *
 * It deletes, in dependency-safe order:
 *   1. watch_sessions for the demo film_id (if any),
 *   2. the demo film's invites — children before parents, to respect the
 *      self-referential parent_invite_id FK,
 *   3. the demo film row itself.
 *
 * Demo-film identification (must be unambiguous, or it refuses to run):
 *   - With --id=<uuid>: that film is fetched and its title AND mux_playback_id
 *     must EXACTLY match the demo constants below, or it aborts.
 *   - Without --id: it looks up films by the demo playback id; there must be
 *     exactly ONE, and its title must match, or it aborts.
 *
 * Hard safety guarantees:
 *   - Deletes ONLY rows tied to the one resolved demo film (its invites, its
 *     watch_sessions, the film row). Never another film, never an invite from
 *     another film, never any users row.
 *   - Belt-and-suspenders: aborts if any invite in scope has a recipient or
 *     sender email on the PROTECTED_EMAILS list (real users — e.g. Trace).
 *     Real users' data lives on other films, so this should never trigger; it
 *     exists so a misidentified film can never take a real person down with it.
 *   - DRY RUN BY DEFAULT: prints exactly what would be deleted and changes
 *     NOTHING. Deletion requires `--execute` AND typing the confirmation phrase
 *     interactively (same pattern as reset-test-data.js).
 *
 * Usage:
 *   node server/teardown-demo-film.js                       # dry run (resolve by playback id)
 *   node server/teardown-demo-film.js --id=<uuid>           # dry run (resolve by id, verified)
 *   node server/teardown-demo-film.js --execute             # delete, after typed confirmation
 *   node server/teardown-demo-film.js --id=<uuid> --execute
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (.env is loaded).
 */
import 'dotenv/config'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

/* ----------------------------- configuration ----------------------------- */

const FILM_TITLE = 'A Sacred Pause'
const FILM_PLAYBACK_ID = '6GMWj01CjP01Y1ee001Vd2qYqUPJtEOgUYz00nG02BYE9F9E'

// Real users — if any in-scope invite references one of these, abort. The demo
// seeder only ever uses "@demo-deepcast.invalid" recipients, so this can only
// fire if the wrong film was somehow resolved. (Trace Bell is the first real user.)
const PROTECTED_EMAILS = [
  'filmmaker@gmail.com',
  'jbregel@gmail.com',
  'contact@tracebelll.com',
  'contact@tinamarieolsen.com',
  'clark.austin@gmail.com',
  'georgie.ggtv@gmail.com',
]

const CONFIRM_PHRASE = 'DELETE DEMO FILM'
const EXECUTE = process.argv.includes('--execute')
const ID_ARG = (process.argv.find((a) => a.startsWith('--id=')) || '').split('=')[1] || null

/* ------------------------------- helpers --------------------------------- */

const norm = (e) => String(e || '').trim().toLowerCase()

function jwtRole(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8')).role
  } catch {
    return null
  }
}

function fail(msg) {
  console.error(`\n✖ ABORT: ${msg}`)
  console.error('  Nothing was changed.')
  process.exit(1)
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  console.log(`\n=== Deepcast demo-film teardown ${EXECUTE ? '(EXECUTE)' : '(DRY RUN — no changes)'} ===`)

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')
  const supabase = createClient(url, key)

  /* ---- resolve the demo film unambiguously ---- */
  let film
  if (ID_ARG) {
    const { data, error } = await supabase
      .from('films')
      .select('id, title, mux_playback_id, creator_id')
      .eq('id', ID_ARG)
      .maybeSingle()
    if (error) fail(`film lookup failed: ${error.message}`)
    if (!data) fail(`No film with id ${ID_ARG}.`)
    if (data.title !== FILM_TITLE || data.mux_playback_id !== FILM_PLAYBACK_ID) {
      fail(
        `Film ${ID_ARG} does not match the demo film signature ` +
          `(title "${data.title}", playback "${data.mux_playback_id}"). Refusing to delete.`
      )
    }
    film = data
  } else {
    const { data, error } = await supabase
      .from('films')
      .select('id, title, mux_playback_id, creator_id')
      .eq('mux_playback_id', FILM_PLAYBACK_ID)
    if (error) fail(`film lookup failed: ${error.message}`)
    const matches = (data || []).filter((f) => f.title === FILM_TITLE)
    if (matches.length === 0) fail(`Demo film not found (title "${FILM_TITLE}", playback ${FILM_PLAYBACK_ID}).`)
    if (matches.length > 1) {
      console.error('\nMultiple films match the demo signature:')
      matches.forEach((f) => console.error(`   - ${f.id}`))
      fail('Could not unambiguously identify the demo film. Re-run with --id=<uuid>.')
    }
    film = matches[0]
  }

  console.log(`\nDemo film resolved: ${film.title} (${film.id})`)
  console.log(`  mux_playback_id: ${film.mux_playback_id}`)

  /* ---- collect everything tied to ONLY this film ---- */
  const [{ data: invites, error: invErr }, { data: sessions, error: wsErr }] = await Promise.all([
    supabase
      .from('invites')
      .select('id, parent_invite_id, recipient_email, sender_email, status, token')
      .eq('film_id', film.id),
    supabase.from('watch_sessions').select('id').eq('film_id', film.id),
  ])
  if (invErr) fail(`invites lookup failed: ${invErr.message}`)
  if (wsErr) fail(`watch_sessions lookup failed: ${wsErr.message}`)

  const deleteInvites = invites || []
  const deleteSessions = sessions || []

  /* ---- safety: no protected (real-user) email may be in scope ---- */
  const protectedSet = new Set(PROTECTED_EMAILS.map(norm))
  const offenders = deleteInvites.filter(
    (i) => protectedSet.has(norm(i.recipient_email)) || protectedSet.has(norm(i.sender_email))
  )
  if (offenders.length) {
    console.error('\nIn-scope invites reference a protected (real-user) email:')
    offenders.forEach((i) => console.error(`   - ${i.id} (recipient ${i.recipient_email}, sender ${i.sender_email})`))
    fail('Refusing to delete — a real user would be affected. This film is not the demo film.')
  }

  /* ---- report ---- */
  const statusCounts = deleteInvites.reduce((acc, i) => ((acc[i.status] = (acc[i.status] || 0) + 1), acc), {})
  console.log('\n— Would delete (scoped to this film only) —')
  console.log(`  invites:        ${deleteInvites.length}`)
  Object.entries(statusCounts).forEach(([s, c]) => console.log(`     ${s.padEnd(9)} ${c}`))
  console.log(`  watch_sessions: ${deleteSessions.length}`)
  console.log(`  films:          1 (${film.id})`)

  if (!EXECUTE) {
    console.log('\n=== DRY RUN complete — nothing was changed. ===')
    console.log(`To delete, the owner runs:  node server/teardown-demo-film.js${ID_ARG ? ` --id=${ID_ARG}` : ''} --execute`)
    return
  }

  /* ---- interactive confirmation ---- */
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to permanently delete the demo film and the rows above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  /* ---- 1) watch_sessions ---- */
  if (deleteSessions.length) {
    const ids = deleteSessions.map((w) => w.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('watch_sessions').delete().in('id', ids.slice(i, i + 100))
      if (error) fail(`watch_sessions delete failed: ${error.message}`)
    }
    console.log(`✓ deleted ${ids.length} watch_sessions`)
  }

  /* ---- 2) invites — children before parents (self-FK on parent_invite_id) ---- */
  let remaining = deleteInvites.map((i) => ({ id: i.id, parent: i.parent_invite_id }))
  let pass = 0
  while (remaining.length) {
    pass += 1
    if (pass > 25) fail('invite deletion did not converge (unexpected parent cycle).')
    const remainingIds = new Set(remaining.map((r) => r.id))
    const parentsInRemaining = new Set(remaining.map((r) => r.parent).filter((p) => p && remainingIds.has(p)))
    const leaves = remaining.filter((r) => !parentsInRemaining.has(r.id))
    if (!leaves.length) fail('invite deletion stuck: every remaining row is some other row\'s parent.')
    const ids = leaves.map((l) => l.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('invites').delete().in('id', ids.slice(i, i + 100))
      if (error) fail(`invites delete failed: ${error.message}`)
    }
    remaining = remaining.filter((r) => !leaves.includes(r))
  }
  if (deleteInvites.length) console.log(`✓ deleted ${deleteInvites.length} invites (${pass} pass(es), children first)`)

  /* ---- 3) the film row ---- */
  const { error: filmDelErr } = await supabase.from('films').delete().eq('id', film.id)
  if (filmDelErr) fail(`film delete failed: ${filmDelErr.message}`)
  console.log(`✓ deleted film ${film.id}`)

  console.log('\n=== Teardown complete. ===')
}

main().catch((err) => {
  console.error('\n✖ teardown failed:', err?.message || err)
  process.exit(1)
})
