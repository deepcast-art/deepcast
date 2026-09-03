/**
 * Remove Circles' seeded ghost invites — FOUNDER-RUN, one-time (2026-09-03).
 *
 * ★ THE DOCUMENTED, GHOST-ONLY EXCEPTION TO FILM-LEVEL PROTECTION ★
 * Circles (6a9c0c79-…) is live and FILM-LEVEL PROTECTED (PROTECTED_FILM_IDS
 * in server/deleteRules.js): every PERSON on it — claimed accounts and
 * in-flight tickets alike — is a real, protected user, and the admin Remove
 * flow refuses to touch any of them. That protection is untouched by this
 * script. What this script removes is NOT people: the ~50 seeded ghost rows
 * created by seed-faith-ghosts.js on 2026-07-22 — fake `…@demo-deepcast
 * .invalid` recipients, never claimed, never ticket-numbered, invisible to
 * every viewer since show_ghosts went false on launch day — which only
 * inflate the admin numbers. The founder approved this exception on
 * 2026-09-03 and runs the script himself; the agent never executes it.
 *
 * What it does (Circles ONLY, by film id — never by title):
 *   1. reads the film row and EVERY invite row on the film (read-only);
 *   2. collects the delete set by ALL of these predicates at once
 *      (server/circlesGhostRules.js, unit-tested): film_id = Circles ·
 *      recipient_email LIKE '%@demo-deepcast.invalid' · claimed_by IS NULL ·
 *      claimed_email IS NULL · no ticket number · not the parent of any
 *      non-ghost row;
 *   3. HARD-ABORTS (prints why, exits non-zero, deletes nothing) if any
 *      collected row has a ticket number, is claimed, carries a non-ghost
 *      email, or is referenced by ANY row outside the set (invites on any
 *      film, or watch_sessions by token); if any collected row's RECIPIENT
 *      or CLAIMANT email is in PROTECTED_EMAILS (the sender is deliberately
 *      not checked — the first-ring ghosts were seeded with the filmmaker
 *      as sender, and deleting a row never touches its sender; the first
 *      execute on 2026-09-03 aborted on exactly that, founder-corrected);
 *      or, at execute time, if the fresh collection's count differs from
 *      the dry-run count it printed;
 *   4. prints every row it would delete;
 *   5. DRY RUN BY DEFAULT — changes nothing. `--execute` additionally
 *      requires typing the confirmation phrase, writes a JSON BACKUP of every
 *      row about to be deleted (full columns) to ~/deepcast-backups/ BEFORE
 *      deleting, deletes by an explicit id list in one statement, then
 *      re-counts: zero ghosts left, the real-row count unchanged.
 *
 * Every real in-flight ticket and every claimant on Circles is structurally
 * outside the set (a ticket number or a claim excludes a row, and every real
 * row on this film is numbered — verified 2026-09-03: №2–№34).
 *
 * Usage:
 *   node server/remove-circles-ghosts.js              # dry run (default) — no writes
 *   node server/remove-circles-ghosts.js --execute    # after the typed phrase; backs up, then deletes
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (.env is loaded).
 */
import 'dotenv/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { createClient } from '@supabase/supabase-js'
import { PROTECTED_EMAILS, isProtectedFilm } from './deleteRules.js'
import {
  CIRCLES_FILM_ID,
  GHOST_EMAIL_SUFFIX,
  collectGhostDeleteSet,
  countMatchesDryRun,
  protectedEmailHits,
} from './circlesGhostRules.js'

/* ----------------------------- configuration ----------------------------- */

const FILM_ID = CIRCLES_FILM_ID // Circles — by id, never by title
const CONFIRM_PHRASE = 'REMOVE CIRCLES GHOSTS'
const EXECUTE = process.argv.includes('--execute')
const BACKUP_ROOT = path.join(os.homedir(), 'deepcast-backups')

/* ------------------------------- helpers --------------------------------- */

const norm = (v) => String(v ?? '').trim().toLowerCase()

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

/** Read every invite row on the film, plus the counts this script reasons about. */
async function readFilmRows(supabase) {
  const { data: rows, error } = await supabase.from('invites').select('*').eq('film_id', FILM_ID)
  if (error) fail(`invites read failed: ${error.message}`)
  const all = rows || []
  const ghostsOnFilm = all.filter((r) => norm(r.recipient_email).endsWith(GHOST_EMAIL_SUFFIX))
  const realOnFilm = all.filter((r) => !norm(r.recipient_email).endsWith(GHOST_EMAIL_SUFFIX))
  return { all, ghostsOnFilm, realOnFilm }
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  console.log(`\n=== Circles ghost removal ${EXECUTE ? '(EXECUTE)' : '(DRY RUN — no changes)'} ===`)
  console.log('Scope: film 6a9c0c79-24f6-427e-ba34-c113acf92d9f (Circles) — ghost rows ONLY.')

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')
  const supabase = createClient(url, key)

  /* ---- the film (read-only) — identity + the protection this script is the exception to ---- */
  const { data: film, error: filmErr } = await supabase
    .from('films')
    .select('id, title, creator_id, show_ghosts, ticket_seq, creator_ticket_no')
    .eq('id', FILM_ID)
    .maybeSingle()
  if (filmErr) fail(`film lookup failed: ${filmErr.message}`)
  if (!film) fail(`Film ${FILM_ID} not found — wrong database?`)
  if (!isProtectedFilm(film.id)) {
    fail(
      `Film ${FILM_ID} is not in PROTECTED_FILM_IDS. This script exists as the documented ghost-only ` +
        'exception to that protection; if the protection has changed, stop and re-read deleteRules.js.'
    )
  }
  console.log(`\nFilm:  ${film.title} (${film.id})  show_ghosts=${film.show_ghosts}  ticket_seq=${film.ticket_seq}`)
  console.log('NOTE:  This film is FILM-LEVEL PROTECTED. People are never touched here — ghosts only.')

  /* ---- collect (pure rules over every row on the film) ---- */
  const { all, ghostsOnFilm, realOnFilm } = await readFilmRows(supabase)
  const { ghosts, excluded, aborts } = collectGhostDeleteSet(all, FILM_ID)

  console.log('\n— The film today —')
  console.log(`  invite rows total:      ${all.length}`)
  console.log(`  ghost-domain rows:      ${ghostsOnFilm.length}`)
  console.log(`  real rows (people):     ${realOnFilm.length}  (ticket numbers ${realOnFilm.map((r) => r.ticket_no).filter((n) => n != null).sort((a, b) => a - b).join(', ') || '—'})`)

  /* ---- protected-email guard: recipient / claimant only (circlesGhostRules.js).
     The sender is NOT checked — the first-ring ghosts were seeded with the
     filmmaker as sender, and deleting a row never touches its sender. ---- */
  const protectedHits = protectedEmailHits(ghosts, PROTECTED_EMAILS)
  if (protectedHits.length) {
    protectedHits.forEach((r) => console.error(`   - ${r.id} (${r.recipient_email} / ${r.claimed_email ?? '—'})`))
    fail(`${protectedHits.length} collected row(s) carry a PROTECTED recipient or claimant email.`)
  }

  /* ---- watch_sessions referencing any collected token (outside reference) ---- */
  const tokens = ghosts.map((r) => r.token).filter(Boolean)
  if (tokens.length) {
    const { data: ws, error: wsErr } = await supabase
      .from('watch_sessions')
      .select('id, invite_token, viewer_id')
      .in('invite_token', tokens)
    if (wsErr) fail(`watch_sessions read failed: ${wsErr.message}`)
    if (ws && ws.length) {
      ws.forEach((w) => console.error(`   - watch_session ${w.id} → token ${w.invite_token}`))
      fail(`${ws.length} watch_session row(s) reference a collected ghost token.`)
    }
  }

  /* ---- hard aborts from the rules ---- */
  if (aborts.length) {
    console.error('\nThe collected set failed verification:')
    aborts.forEach((a) => console.error(`   - ${a.id}: ${a.reason}`))
    fail(`${aborts.length} verification failure(s).`)
  }
  if (excluded.length) {
    console.log('\n— Ghost rows deliberately LEFT ALONE (part of a real lineage) —')
    excluded.forEach((e) => console.log(`   - ${e.id}: ${e.reason}`))
  }
  // Every ghost-domain row on the film should be in the set; anything else
  // is a surprise worth stopping for.
  const unexplained = ghostsOnFilm.length - ghosts.length - excluded.length
  if (unexplained !== 0) {
    fail(
      `${ghostsOnFilm.length} ghost-domain rows on the film, but ${ghosts.length} collected + ${excluded.length} excluded — ` +
        `${unexplained} unexplained (a ghost-domain row with a ticket number or a claim?). Inspect before running again.`
    )
  }

  /* ---- the plan ---- */
  console.log(`\n— Delete set: ${ghosts.length} ghost invite(s) —`)
  ghosts
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((r) =>
      console.log(
        `   ${r.id}  ${r.recipient_name} <${r.recipient_email}>  status=${r.status}  ticket_no=${r.ticket_no ?? 'NULL'}  claimed=${r.claimed_by || r.claimed_email ? 'YES' : 'no'}  created=${String(r.created_at).slice(0, 10)}`
      )
    )
  console.log(`\n  After removal the film would hold ${realOnFilm.length} real rows (the same ${realOnFilm.length} as today) and 0 ghosts.`)

  if (ghosts.length === 0) {
    console.log('\nNothing to delete — the film carries no ghost rows.')
    return
  }

  if (!EXECUTE) {
    console.log('\n=== DRY RUN complete — nothing was changed. ===')
    console.log('To remove the ghosts, the founder runs:  node server/remove-circles-ghosts.js --execute')
    return
  }

  /* ---- interactive confirmation ---- */
  const printedCount = ghosts.length
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to back up and delete the ${printedCount} ghost invites above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  /* ---- fresh collection: the data must not have moved ---- */
  const fresh = await readFilmRows(supabase)
  const freshSet = collectGhostDeleteSet(fresh.all, FILM_ID)
  if (freshSet.aborts.length) {
    freshSet.aborts.forEach((a) => console.error(`   - ${a.id}: ${a.reason}`))
    fail('Fresh collection failed verification.')
  }
  if (!countMatchesDryRun(printedCount, freshSet.ghosts.length)) {
    fail(`Fresh collection found ${freshSet.ghosts.length} ghost rows, but ${printedCount} were printed above. Re-run the dry run.`)
  }
  const printedIds = new Set(ghosts.map((r) => r.id))
  if (!freshSet.ghosts.every((r) => printedIds.has(r.id))) {
    fail('Fresh collection contains rows that were not in the printed set. Re-run the dry run.')
  }
  const realBefore = fresh.realOnFilm.length

  /* ---- backup BEFORE deleting ---- */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(BACKUP_ROOT, `${stamp.slice(0, 10)}-circles-ghosts`)
  fs.mkdirSync(backupDir, { recursive: true })
  const backupFile = path.join(backupDir, `circles-ghost-invites-${stamp}.json`)
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        film: { id: film.id, title: film.title, show_ghosts: film.show_ghosts, ticket_seq: film.ticket_seq },
        deletedAt: new Date().toISOString(),
        count: freshSet.ghosts.length,
        rows: freshSet.ghosts,
      },
      null,
      2
    )
  )
  console.log(`\n✓ backup written: ${backupFile} (${freshSet.ghosts.length} rows, full columns)`)

  /* ---- delete by explicit id list, one statement ---- */
  const ids = freshSet.ghosts.map((r) => r.id)
  const { error: delErr } = await supabase.from('invites').delete().in('id', ids).eq('film_id', FILM_ID)
  if (delErr) fail(`delete failed: ${delErr.message} (the backup above stands; nothing partial should have applied)`)
  console.log(`✓ deleted ${ids.length} ghost invite(s) from ${film.title}`)

  /* ---- verify ---- */
  const after = await readFilmRows(supabase)
  console.log('\n— After —')
  console.log(`  ghost-domain rows: ${after.ghostsOnFilm.length}  (expected 0)`)
  console.log(`  real rows:         ${after.realOnFilm.length}  (expected ${realBefore})`)
  if (after.ghostsOnFilm.length !== 0 || after.realOnFilm.length !== realBefore) {
    console.error('\n✖ Post-delete counts are not what was expected — inspect the film before doing anything else.')
    process.exit(1)
  }
  console.log('\n=== Done. The admin card and sidebar now count real tickets only. ===')
}

main().catch((err) => {
  console.error('\n✖ removal failed:', err?.message || err)
  process.exit(1)
})
