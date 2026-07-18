/**
 * Backfill per-film wallets from history (Piece F, 2026-07-17).
 *
 * FOUNDER CARRY RULE: for each (person, film) pair where the person exists
 * in that film's network:
 *   balance   = max(0, 5 − count of invites they generated on that film)
 *               (generated = sender_id match ∪ parent-pointer match — the
 *                established union; claim-flow sends before Piece E carried
 *                no sender_id)
 *   unlimited = carried from the dormant users.unlimited_shares onto each
 *               of their films' rows
 * Role-unlimited people (creator, team members, team-linked viewers) get no
 * rows — their unlimited is global by role and needs no wallet.
 *
 * SAFETY (house rules):
 *   - DRY-RUN BY DEFAULT; --execute requires typing the confirmation phrase.
 *   - INSERT-ONLY: rows are upserted with ignore-duplicates — an existing
 *     wallet row is NEVER updated, nothing is ever deleted. Protected real
 *     users are therefore INCLUDED (they need their true balances) and are
 *     listed in the dry run like everyone else (approved 2026-07-17).
 *   - THE OWNER runs --execute personally.
 */
import 'dotenv/config'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'
import { isRoleUnlimitedSharer } from '../src/lib/shares.js'

const EXECUTE = process.argv.includes('--execute')
const CONFIRM_PHRASE = 'BACKFILL FILM TICKETS'

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
const norm = (e) => String(e || '').trim().toLowerCase()

async function main() {
  const [{ data: users, error: uErr }, { data: invites, error: iErr }, { data: existing, error: wErr }] =
    await Promise.all([
      supabase.from('users').select('id, email, name, role, team_creator_id, unlimited_shares'),
      supabase
        .from('invites')
        .select('id, film_id, sender_id, recipient_email, claimed_email, claimed_by, parent_invite_id'),
      supabase.from('film_tickets').select('user_id, film_id'),
    ])
  if (uErr || iErr || wErr) fail(uErr?.message || iErr?.message || wErr?.message)

  const existingKeys = new Set((existing || []).map((w) => `${w.user_id}|${w.film_id}`))
  const userByEmail = new Map()
  for (const u of users || []) {
    const e = norm(u.email)
    if (e) userByEmail.set(e, u)
  }
  const userById = new Map((users || []).map((u) => [String(u.id), u]))

  // (person, film) membership + received-invite ids per pair.
  const membership = new Map() // key user|film → { user, filmId, receivedIds: Set }
  const touch = (user, filmId) => {
    const k = `${user.id}|${filmId}`
    if (!membership.has(k)) membership.set(k, { user, filmId, receivedIds: new Set() })
    return membership.get(k)
  }
  for (const inv of invites || []) {
    // Received/claimed: claimed_by first, then email matches.
    const claimedUser = inv.claimed_by != null ? userById.get(String(inv.claimed_by)) : null
    const emailUser =
      userByEmail.get(norm(inv.claimed_email)) || userByEmail.get(norm(inv.recipient_email))
    const recipient = claimedUser || emailUser
    if (recipient) touch(recipient, inv.film_id).receivedIds.add(inv.id)
    // Sender participation (their sends on this film).
    const sender = inv.sender_id != null ? userById.get(String(inv.sender_id)) : null
    if (sender) touch(sender, inv.film_id)
  }

  // Generated counts per pair: sender_id match ∪ parent-pointer match.
  const plans = []
  for (const { user, filmId, receivedIds } of membership.values()) {
    if (isRoleUnlimitedSharer(user)) continue // global by role, no wallet
    if (existingKeys.has(`${user.id}|${filmId}`)) continue // insert-only: skip existing
    const generated = (invites || []).filter(
      (inv) =>
        inv.film_id === filmId &&
        ((inv.sender_id != null && String(inv.sender_id) === String(user.id)) ||
          (inv.parent_invite_id != null && receivedIds.has(inv.parent_invite_id)))
    ).length
    plans.push({
      userId: user.id,
      email: norm(user.email),
      name: user.name || '?',
      filmId,
      generated,
      balance: Math.max(0, 5 - generated),
      unlimited: user.unlimited_shares === true,
    })
  }
  plans.sort((a, b) => a.email.localeCompare(b.email) || a.filmId.localeCompare(b.filmId))

  console.log(
    `\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} — ${plans.length} film wallet(s) to create (insert-only, existing rows untouched):\n`
  )
  for (const p of plans) {
    console.log(
      `  ${p.name} <${p.email}> · film ${p.filmId}\n` +
        `    → balance ${p.balance} (5 − ${p.generated} generated)${p.unlimited ? ' · unlimited (carried)' : ''}`
    )
  }
  if (!plans.length) console.log('  (nothing to do — every pair already has a wallet row)')

  if (!EXECUTE) {
    console.log('\nDry run only — nothing written. Re-run with --execute to apply (owner only).')
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to create the ${plans.length} wallet row(s) above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  let done = 0
  for (const p of plans) {
    const { error } = await supabase
      .from('film_tickets')
      .upsert(
        { user_id: p.userId, film_id: p.filmId, balance: p.balance, unlimited: p.unlimited },
        { onConflict: 'user_id,film_id', ignoreDuplicates: true }
      )
    if (error) {
      console.error(`  ✗ ${p.email} / ${p.filmId}: ${error.message}`)
      continue
    }
    done += 1
  }
  console.log(`\nDone — ${done}/${plans.length} wallet row(s) created.`)
}

main().catch((err) => fail(err?.message || String(err)))
