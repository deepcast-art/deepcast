/**
 * Backfill silent accounts for EXISTING claimants (Piece E, 2026-07-17).
 *
 * For every invite that was claimed before silent accounts existed
 * (claimed_email set, claimed_by NULL), this script:
 *   1. finds or creates the passwordless account for the claimed email
 *      (create: email_confirm — no email is ever sent, no password;
 *       users row role 'viewer');
 *   2. carries the REMAINING invite-wallet balance into the account:
 *        - account CREATED here → invite_allocation = tickets_remaining ?? 5
 *          (spent tickets stay spent);
 *        - account ALREADY EXISTED → attach only; the existing account's
 *          invite_allocation is NEVER modified (claiming is not a top-up);
 *   3. stamps invites.claimed_by;
 *   4. sets that row's tickets_remaining to 0 — never NULL (NULL reads as a
 *      fresh full grant to the invite wallet), so no second spendable
 *      balance can exist.
 *
 * SAFETY (house rules for every data script):
 *   - DRY-RUN BY DEFAULT: prints exactly what would happen, row by row.
 *   - --execute requires typing the confirmation phrase.
 *   - Hard refusal if any target row's claimed email is a protected real
 *     user (full teardown-script list) — abort entirely, owner reviews.
 *   - Explicit target query only (claimed_email NOT NULL AND claimed_by
 *     NULL); re-runs are naturally idempotent because stamped rows drop out
 *     of the target set.
 *   - THE OWNER runs --execute personally.
 */
import 'dotenv/config'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'
import { INITIAL_CLAIMANT_TICKETS } from '../src/lib/ticketRules.js'

const EXECUTE = process.argv.includes('--execute')
const CONFIRM_PHRASE = 'BACKFILL CLAIMANT ACCOUNTS'

// Protected real users — same superset as server/teardown-demo-film.js.
const PROTECTED_EMAILS = [
  'filmmaker@gmail.com',
  'contact@tracebelll.com',
  'contact@tinamarieolsen.com',
  'clark.austin@gmail.com',
  'georgie.ggtv@gmail.com',
]

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

/* ---- service-role assertion (never run this with an anon key) ---- */
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

/** Admin scan for an auth user by email (paginated — the admin API has no direct lookup). */
async function findAuthUserByEmail(emailNorm) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) fail(`auth listUsers failed: ${error.message}`)
    const hit = (data?.users || []).find((u) => norm(u.email) === emailNorm)
    if (hit) return hit
    if (!data?.users?.length || data.users.length < 200) return null
  }
  return null
}

async function main() {
  /* ---- 1) The explicit target set ---- */
  const { data: targets, error: targetErr } = await supabase
    .from('invites')
    .select('id, link_slug, film_id, recipient_name, claimed_email, claimed_at, tickets_remaining, status')
    .not('claimed_email', 'is', null)
    .is('claimed_by', null)
    .order('claimed_at', { ascending: true })
  if (targetErr) fail(`target query failed: ${targetErr.message}`)

  if (!targets?.length) {
    console.log('Nothing to backfill — every claimed invite already has claimed_by stamped.')
    return
  }

  /* ---- 2) Hard refusal on protected emails ---- */
  for (const t of targets) {
    if (PROTECTED_EMAILS.includes(norm(t.claimed_email))) {
      fail(
        `Target set contains a protected email (${norm(t.claimed_email)}, invite ${t.id}). ` +
          'Aborting entirely — review this row by hand.'
      )
    }
  }

  /* ---- 3) Plan (and print) every row ---- */
  console.log(`\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} — ${targets.length} claimed invite(s) without an account:\n`)
  const plans = []
  for (const t of targets) {
    const emailNorm = norm(t.claimed_email)
    const existing = await findAuthUserByEmail(emailNorm)
    const carried = t.tickets_remaining ?? INITIAL_CLAIMANT_TICKETS
    const plan = existing
      ? { action: 'ATTACH', userId: existing.id }
      : { action: 'CREATE', allocation: carried }
    plans.push({ invite: t, emailNorm, existing, plan })
    console.log(
      `  ${t.link_slug || t.id} — "${t.recipient_name || '?'}" <${emailNorm}> ` +
        `(status ${t.status}, tickets_remaining ${t.tickets_remaining ?? 'NULL→' + carried})\n` +
        (existing
          ? `    → ATTACH to existing account ${existing.id} (allocation untouched), stamp claimed_by, tickets_remaining → 0`
          : `    → CREATE silent account (allocation ${carried}), stamp claimed_by, tickets_remaining → 0`)
    )
  }

  if (!EXECUTE) {
    console.log('\nDry run only — nothing written. Re-run with --execute to apply (owner only).')
    return
  }

  /* ---- 4) Typed confirmation ---- */
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to apply the ${plans.length} change(s) above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  /* ---- 5) Apply, row by row ---- */
  let done = 0
  for (const { invite, emailNorm, existing, plan } of plans) {
    let userId
    if (existing) {
      userId = existing.id
      if (!existing.email_confirmed_at) {
        await supabase.auth.admin.updateUserById(userId, { email_confirm: true })
      }
    } else {
      const displayName = (invite.recipient_name || '').trim() || emailNorm.split('@')[0]
      const { data, error } = await supabase.auth.admin.createUser({
        email: emailNorm,
        email_confirm: true,
        user_metadata: { full_name: displayName },
      })
      if (error || !data?.user?.id) {
        console.error(`  ✗ ${emailNorm}: createUser failed (${error?.message}) — row skipped`)
        continue
      }
      userId = data.user.id
    }

    // users row: create only when missing. Allocation is set ONLY on create.
    const { data: profileRow } = await supabase.from('users').select('id').eq('id', userId).maybeSingle()
    if (!profileRow) {
      const displayName = (invite.recipient_name || '').trim() || emailNorm.split('@')[0]
      const { error: profErr } = await supabase.from('users').insert({
        id: userId,
        email: emailNorm,
        name: displayName,
        first_name: displayName,
        last_name: '',
        role: 'viewer',
        invite_allocation: plan.action === 'CREATE' ? plan.allocation : INITIAL_CLAIMANT_TICKETS,
      })
      if (profErr) {
        if (!existing) await supabase.auth.admin.deleteUser(userId).catch(() => {})
        console.error(`  ✗ ${emailNorm}: profile insert failed (${profErr.message}) — row skipped`)
        continue
      }
    }

    const { error: stampErr } = await supabase
      .from('invites')
      .update({ claimed_by: userId, tickets_remaining: 0 })
      .eq('id', invite.id)
      .is('claimed_by', null)
    if (stampErr) {
      console.error(`  ✗ ${emailNorm}: claimed_by stamp failed (${stampErr.message})`)
      continue
    }
    done += 1
    console.log(`  ✓ ${emailNorm} → ${plan.action === 'ATTACH' ? 'attached to' : 'created'} ${userId}`)
  }
  console.log(`\nDone — ${done}/${plans.length} row(s) backfilled.`)
}

main().catch((err) => fail(err?.message || String(err)))
