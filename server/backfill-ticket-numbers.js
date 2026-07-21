/**
 * Backfill ticket numbers (dashboard redesign, 2026-07-20).
 *
 * Gives every EXISTING invite its sequential per-film "Ticket No.", counted
 * in creation order (oldest first). Numbers count links GENERATED.
 *
 * OWNER DECISION 2026-07-20: seeded demo ghosts (@demo.invalid,
 * @demo-deepcast.invalid) get NO numbers — real people start at №1.
 * Ghost rows keep ticket_no NULL forever.
 *
 * RUN PROMPTLY after the migration + deploy: new links mint numbers from the
 * live counter immediately, so the longer this waits, the more new links
 * take low numbers ahead of grandfathered rows. (Never a correctness
 * problem — the range is reserved atomically — purely cosmetic ordering.)
 *
 * SAFETY (house rules):
 *   - DRY-RUN BY DEFAULT; --execute requires typing the confirmation phrase.
 *   - Writes ONLY invites.ticket_no on rows where it is NULL, and
 *     films.ticket_seq (the counter). Never deletes, never touches any
 *     other column, protected users' rows are numbered like everyone
 *     else's (numbering is additive and harmless).
 *   - RACE-SAFE vs live traffic: per film the script reserves the whole
 *     number range with one compare-and-swap on films.ticket_seq; if a link
 *     is generated mid-run the CAS fails and that film is skipped with a
 *     message — just re-run.
 *   - THE OWNER runs --execute personally.
 */
import 'dotenv/config'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'
import { isDemoGhostInvite } from '../src/lib/demoGhosts.js'
import { isVoidInvite, needsTicketNumber } from '../src/lib/inviteExistence.js'

const EXECUTE = process.argv.includes('--execute')
const CONFIRM_PHRASE = 'BACKFILL TICKET NUMBERS'

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env')
function jwtRole(k) {
  try {
    return JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString()).role
  } catch {
    return null
  }
}
if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const [{ data: films, error: fErr }, { data: invites, error: iErr }] = await Promise.all([
    supabase.from('films').select('id, title, ticket_seq'),
    supabase
      .from('invites')
      .select('id, film_id, recipient_name, recipient_email, status, created_at, ticket_no')
      .order('created_at', { ascending: true }),
  ])
  if (fErr || iErr) fail(fErr?.message || iErr?.message)
  if (films?.some((f) => f.ticket_seq == null)) {
    fail('films.ticket_seq missing — apply supabase/migrations/20260720_ticket_numbers.sql first.')
  }

  const plans = []
  for (const film of films || []) {
    const rows = (invites || []).filter((inv) => inv.film_id === film.id)
    const ghosts = rows.filter(isDemoGhostInvite).length
    const voids = rows.filter(isVoidInvite).length
    // ONE existence rule (src/lib/inviteExistence.js): ghosts and voided
    // links are never numbered, anywhere, ever.
    const toNumber = rows.filter(needsTicketNumber)
    if (!toNumber.length) continue
    const start = film.ticket_seq
    plans.push({
      film,
      startSeq: start,
      ghosts,
      voids,
      assignments: toNumber.map((inv, i) => ({ inv, ticketNo: start + 1 + i })),
    })
  }

  console.log(`\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} — ticket numbers to assign (oldest first):\n`)
  for (const p of plans) {
    console.log(
      `  ${p.film.title} — ${p.assignments.length} invite(s), №${p.startSeq + 1}…№${
        p.startSeq + p.assignments.length
      }${p.ghosts ? ` (${p.ghosts} demo ghost row(s) skipped — never numbered)` : ''}${
        p.voids ? ` (${p.voids} voided link(s) skipped — never numbered)` : ''
      }`
    )
    for (const a of p.assignments) {
      const who = a.inv.recipient_name?.trim() || a.inv.recipient_email || '(unnamed link)'
      console.log(`    №${a.ticketNo} → ${who} · created ${a.inv.created_at}`)
    }
  }
  if (!plans.length) console.log('  (nothing to do — every non-ghost invite is already numbered)')

  if (!EXECUTE) {
    console.log('\nDry run only — nothing written. Re-run with --execute to apply (owner only).')
    return
  }
  if (!plans.length) return

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const total = plans.reduce((s, p) => s + p.assignments.length, 0)
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to number the ${total} invite(s) above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  for (const p of plans) {
    // Reserve the whole range atomically (CAS on the counter). If a link was
    // generated since the read, the CAS misses — skip this film and re-run.
    const newSeq = p.startSeq + p.assignments.length
    const { data: reserved, error: casErr } = await supabase
      .from('films')
      .update({ ticket_seq: newSeq })
      .eq('id', p.film.id)
      .eq('ticket_seq', p.startSeq)
      .select('id')
    if (casErr) {
      console.error(`  ✗ ${p.film.title}: ${casErr.message}`)
      continue
    }
    if (!reserved?.length) {
      console.warn(
        `  ⚠ ${p.film.title}: counter moved during the run (a link was generated) — skipped. Re-run the script.`
      )
      continue
    }
    let done = 0
    for (const a of p.assignments) {
      const { error } = await supabase
        .from('invites')
        .update({ ticket_no: a.ticketNo })
        .eq('id', a.inv.id)
        .is('ticket_no', null)
      if (error) {
        console.error(`  ✗ №${a.ticketNo} (${a.inv.id}): ${error.message}`)
        continue
      }
      done += 1
    }
    console.log(`  ✓ ${p.film.title}: ${done}/${p.assignments.length} numbered.`)
  }
  console.log('\nDone.')
}

main().catch((err) => fail(err?.message || String(err)))
