/**
 * One-time production cleanup: remove every test user/node, keep ONLY
 *   (a) the filmmaker's own account (and their film), and
 *   (b) the original 50 seeded display invites ("nodes" on the network graph).
 *
 * KEEP-SET IDENTIFICATION
 * The 50 seeded invites were inserted together in a single batch with backdated
 * created_at dates. The batch signature: every row shares the EXACT same
 * time-of-day fraction down to the microsecond (e.g. `13:29:10.429899+00`),
 * which cannot happen for organically created invites. The script groups all
 * invites by that fractional signature, requires exactly ONE multi-row group,
 * and requires its size to be EXACTLY 50 — anything else aborts with an
 * explanation and changes nothing.
 *
 * DELETE-SET
 * Everything else: all other invites (including the five allowlisted
 * reset-script test emails and any plus-addressed test accounts), all
 * watch_sessions, all team_invites, every users row except the filmmaker, and
 * every auth user except the filmmaker. Deletion runs in dependency-safe
 * order: watch_sessions → invites (children before parents) → team_invites →
 * profile rows → auth users.
 *
 * SAFETY
 *   - DRY RUN BY DEFAULT. `node server/cleanup-test-nodes.js` prints exactly
 *     what would be kept and deleted, with counts, and changes NOTHING.
 *   - Actual deletion requires `--execute` AND typing the confirmation phrase
 *     interactively.
 *   - Aborts (changing nothing) if: the filmmaker can't be resolved; the seed
 *     batch isn't confidently exactly 50; a kept invite depends on a deleted
 *     one; or any kept invite's sender is a deleted user.
 *   - The dry run also verifies that server/reset-test-data.js will run
 *     cleanly after cleanup (its current blockers must all be in the
 *     delete-set).
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import 'dotenv/config'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

const FILMMAKER_EMAIL = 'filmmaker@gmail.com'
const EXPECTED_SEED_COUNT = 50
const CONFIRM_PHRASE = 'DELETE TEST DATA'

/** The reset script's allowlist — used only for the post-cleanup compatibility check. */
const RESET_TARGET_EMAILS = [
  'ien.chi96@gmail.com',
  'i@theinsight.art',
  'invites@deepcast.art',
  'deepcast@theinsight.art',
  'jobs@wcfoundation.org',
]

const EXECUTE = process.argv.includes('--execute')
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

/** Time-of-day fraction of a timestamptz string — the seed batch signature. */
function timeOfDaySignature(createdAt) {
  const s = String(createdAt || '')
  const t = s.includes('T') ? s.split('T')[1] : s.split(' ')[1]
  return t || ''
}

async function listAllAuthUsers(supabase) {
  const users = []
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    users.push(...(data.users || []))
    if (!data.users?.length || data.users.length < 1000) break
    page += 1
  }
  return users
}

async function main() {
  console.log(`\n=== Deepcast test-node cleanup ${EXECUTE ? '(EXECUTE)' : '(DRY RUN — no changes)'} ===`)

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')
  const supabase = createClient(url, key)

  /* ---------------- resolve the filmmaker (never touched) ---------------- */

  const { data: filmmaker, error: fmErr } = await supabase
    .from('users')
    .select('id, email, name, role')
    .ilike('email', FILMMAKER_EMAIL)
    .maybeSingle()
  if (fmErr) fail(`filmmaker lookup failed: ${fmErr.message}`)
  if (!filmmaker || filmmaker.role !== 'creator') fail('Filmmaker (creator) account not found.')

  const { data: films } = await supabase.from('films').select('id, title, creator_id')
  const foreignFilms = (films || []).filter((f) => f.creator_id !== filmmaker.id)
  if (foreignFilms.length) {
    fail(`Found film(s) not owned by the filmmaker: ${foreignFilms.map((f) => f.title).join(', ')}`)
  }

  console.log(`\nFilmmaker (kept): ${filmmaker.email} (${filmmaker.id})`)
  for (const f of films || []) console.log(`Film (kept):      ${f.title} (${f.id})`)

  /* ---------------- load everything ---------------- */

  const [{ data: invites, error: invErr }, { data: profiles, error: profErr },
         { data: sessions, error: wsErr }, { data: teamInvites, error: tiErr }, authUsers] =
    await Promise.all([
      supabase.from('invites').select('id, token, sender_id, sender_name, recipient_name, recipient_email, parent_invite_id, status, created_at').order('created_at', { ascending: true }),
      supabase.from('users').select('id, email, name, role, created_at'),
      supabase.from('watch_sessions').select('id, viewer_id, invite_token'),
      supabase.from('team_invites').select('id, email'),
      listAllAuthUsers(supabase),
    ])
  if (invErr || profErr || wsErr || tiErr) {
    fail(`load failed: ${invErr?.message || profErr?.message || wsErr?.message || tiErr?.message}`)
  }

  /* ---------------- identify the seeded 50 (batch signature) ---------------- */

  const bySignature = new Map()
  for (const inv of invites || []) {
    const sig = timeOfDaySignature(inv.created_at)
    if (!bySignature.has(sig)) bySignature.set(sig, [])
    bySignature.get(sig).push(inv)
  }
  // Batch candidates: signatures shared by more than one row. Organic invites get
  // a unique microsecond fraction; only a batch insert repeats one exactly.
  const candidates = [...bySignature.entries()].filter(([, rows]) => rows.length > 1)

  if (candidates.length !== 1) {
    console.error('\nBatch-signature groups found (signature → rows):')
    for (const [sig, rows] of candidates) console.error(`   ${sig} → ${rows.length} invites`)
    fail(
      `Could not confidently identify the seeded display batch: expected exactly ONE ` +
      `multi-row created_at signature group, found ${candidates.length}.`
    )
  }

  const [seedSignature, seedInvites] = candidates[0]
  if (seedInvites.length !== EXPECTED_SEED_COUNT) {
    fail(
      `The seeded batch (signature ${seedSignature}) holds ${seedInvites.length} invites, ` +
      `not exactly ${EXPECTED_SEED_COUNT}. Refusing to guess.`
    )
  }

  const keepInviteIds = new Set(seedInvites.map((i) => i.id))

  /* ---------------- consistency checks on the keep-set ---------------- */

  for (const inv of seedInvites) {
    if (inv.parent_invite_id && !keepInviteIds.has(inv.parent_invite_id)) {
      fail(`Kept seed invite ${inv.id} has a parent outside the keep-set (${inv.parent_invite_id}).`)
    }
    if (inv.sender_id && inv.sender_id !== filmmaker.id) {
      fail(`Kept seed invite ${inv.id} was sent by a non-filmmaker user (${inv.sender_id}).`)
    }
  }
  // No deleted invite may be the parent of a kept one (checked above), and no kept
  // invite may be the parent of a deleted child we'd orphan — children are deleted, fine.

  /* ---------------- build the delete-set ---------------- */

  const deleteInvites = (invites || []).filter((i) => !keepInviteIds.has(i.id))
  const deleteProfiles = (profiles || []).filter((p) => p.id !== filmmaker.id)
  const deleteAuthUsers = authUsers.filter((u) => norm(u.email) !== norm(filmmaker.email))
  const deleteSessions = sessions || []
  const deleteTeamInvites = teamInvites || []

  // Paranoia: the filmmaker must not appear in any delete list.
  if (deleteAuthUsers.some((u) => u.id === filmmaker.id)) fail('Filmmaker auth user resolved into the delete-set.')
  if (deleteProfiles.some((p) => p.id === filmmaker.id)) fail('Filmmaker profile resolved into the delete-set.')

  /* ---------------- report ---------------- */

  console.log(`\n— KEEP (${seedInvites.length} seeded display nodes, batch signature ${seedSignature}) —`)
  seedInvites.forEach((i, n) => {
    console.log(
      `  ${String(n + 1).padStart(2)}. ${i.recipient_name || '(no name)'} <${i.recipient_email}>` +
      `  created ${i.created_at}`
    )
  })

  console.log(`\n— DELETE —`)
  console.log(`  invites:        ${deleteInvites.length}`)
  deleteInvites.forEach((i) => console.log(`     - ${i.recipient_email} (status ${i.status}, token ${i.token})`))
  console.log(`  watch_sessions: ${deleteSessions.length} (all — every session belongs to test activity)`)
  console.log(`  team_invites:   ${deleteTeamInvites.length}`)
  console.log(`  profile rows:   ${deleteProfiles.length}`)
  deleteProfiles.forEach((p) => console.log(`     - ${p.email} (${p.role})`))
  console.log(`  auth users:     ${deleteAuthUsers.length}`)
  deleteAuthUsers.forEach((u) => console.log(`     - ${u.email}`))

  console.log(`\n— SUMMARY —`)
  console.log(`  keep:   filmmaker account + film + ${seedInvites.length} seeded invites`)
  console.log(
    `  delete: ${deleteInvites.length} invites, ${deleteSessions.length} watch_sessions, ` +
    `${deleteTeamInvites.length} team_invites, ${deleteProfiles.length} profiles, ${deleteAuthUsers.length} auth users`
  )

  /* ------ post-cleanup reset-test-data.js compatibility check ------ */
  // The reset script aborts when a NON-target invite depends on a target invite.
  // After cleanup all non-seed invites are gone, so the only possible blockers are
  // current rows — verify every one of them is in the delete-set.
  const deleteIds = new Set(deleteInvites.map((i) => i.id))
  const targetInviteIds = new Set(
    (invites || [])
      .filter((i) => RESET_TARGET_EMAILS.includes(norm(i.recipient_email)))
      .map((i) => i.id)
  )
  const resetBlockers = (invites || []).filter(
    (i) => i.parent_invite_id && targetInviteIds.has(i.parent_invite_id) && !targetInviteIds.has(i.id)
  )
  const unresolvedBlockers = resetBlockers.filter((i) => !deleteIds.has(i.id))
  console.log(
    `\n  reset-test-data.js after cleanup: ${unresolvedBlockers.length === 0 ? 'will run cleanly ✓' : 'STILL BLOCKED ✖'}` +
    (resetBlockers.length
      ? ` (${resetBlockers.length} current blocker(s), all in the delete-set: ${unresolvedBlockers.length === 0})`
      : ' (no blockers found)')
  )

  if (!EXECUTE) {
    console.log('\n=== DRY RUN complete — nothing was changed. ===')
    console.log('To actually delete, the owner runs:  node server/cleanup-test-nodes.js --execute')
    return
  }

  /* ---------------- interactive confirmation ---------------- */

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to permanently delete the rows listed above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  /* ---------------- delete in dependency-safe order ---------------- */

  // 1) watch_sessions (FK → users, films)
  if (deleteSessions.length) {
    const ids = deleteSessions.map((w) => w.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('watch_sessions').delete().in('id', ids.slice(i, i + 100))
      if (error) fail(`watch_sessions delete failed: ${error.message}`)
    }
    console.log(`✓ deleted ${ids.length} watch_sessions`)
  }

  // 2) invites — children before parents (self-FK on parent_invite_id)
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

  // 3) team_invites
  if (deleteTeamInvites.length) {
    const { error } = await supabase.from('team_invites').delete().in('id', deleteTeamInvites.map((t) => t.id))
    if (error) fail(`team_invites delete failed: ${error.message}`)
    console.log(`✓ deleted ${deleteTeamInvites.length} team_invites`)
  }

  // 4) profile rows
  if (deleteProfiles.length) {
    const { error } = await supabase.from('users').delete().in('id', deleteProfiles.map((p) => p.id))
    if (error) fail(`users delete failed: ${error.message}`)
    console.log(`✓ deleted ${deleteProfiles.length} profile rows`)
  }

  // 5) auth users
  for (const u of deleteAuthUsers) {
    const { error } = await supabase.auth.admin.deleteUser(u.id)
    if (error) fail(`auth user delete failed (${u.email}): ${error.message}`)
  }
  if (deleteAuthUsers.length) console.log(`✓ deleted ${deleteAuthUsers.length} auth users`)

  console.log('\n=== Cleanup complete. ===')
  console.log('Run `node server/reset-test-data.js` to mint fresh invite links for the five test emails.')
}

main().catch((err) => {
  console.error('\n✖ cleanup failed:', err?.message || err)
  process.exit(1)
})
