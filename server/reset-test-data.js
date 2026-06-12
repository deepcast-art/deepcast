/**
 * Repeatable test-data reset — scoped to an EXPLICIT allowlist of test emails only.
 *
 * For each allowlisted email (and NOTHING else) this:
 *   1. deletes its auth user, its profile row, its watch_sessions, and any invites it
 *      received or sent during testing;
 *   2. (re)creates one pristine, unopened filmmaker invite to that email for "The New Narrative"
 *      with a fresh token;
 *   3. prints the fresh invite URLs to test with.
 *
 * Hard safety guarantees:
 *   - Operates on an explicit allowlist (TARGET_EMAILS) — never a pattern/substring match.
 *   - Refuses to run if the allowlist contains a protected email (the filmmaker
 *     account or any real production user — see PROTECTED_EMAILS).
 *   - Reads (never modifies/deletes) the filmmaker account and the film row.
 *   - Aborts if a NON-target invite depends on a target invite (so it never touches other data).
 *   - --dry-run prints exactly what it WOULD delete/create and changes nothing.
 *
 * Usage:
 *   node server/reset-test-data.js --dry-run     # preview, no writes
 *   node server/reset-test-data.js               # execute
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (.env is loaded).
 */
import 'dotenv/config'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

/* ----------------------------- configuration ----------------------------- */

const TARGET_EMAILS = [
  'ien.chi96@gmail.com',
  'i@theinsight.art',
  'invites@deepcast.art',
  'deepcast@theinsight.art',
  'jobs@wcfoundation.org',
].map((e) => e.trim().toLowerCase())

// Real users — the script refuses to run if the allowlist ever includes one.
// contact@tracebelll.com is Trace Bell, the first real production user (June 2026).
const PROTECTED_EMAILS = ['filmmaker@gmail.com', 'contact@tracebelll.com']
const FILM_TITLE = 'The New Narrative'
// Informational only — invite links never expire in the MVP (see server/inviteValidation.js).
const INVITE_EXPIRY_DAYS = 3650

const DRY_RUN = process.argv.includes('--dry-run')
const BASE_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')
const PROD_BASE_URL = 'https://deepcast.art'

/* ------------------------------- helpers --------------------------------- */

const norm = (e) => String(e || '').trim().toLowerCase()
const genToken = () => crypto.randomBytes(16).toString('hex')

function titleCaseLocalPart(email) {
  const local = norm(email).split('@')[0] || 'Friend'
  const first = local.split(/[._-]+/)[0] || local
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function jwtRole(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8')).role
  } catch {
    return null
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}`)
  process.exit(1)
}

const tag = DRY_RUN ? '[dry-run] would' : '✓'

/* --------------------------------- main ---------------------------------- */

async function listAuthUsersByEmail(supabase, emails) {
  const set = new Set(emails)
  const found = []
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    for (const u of data.users || []) {
      if (set.has(norm(u.email))) found.push({ id: u.id, email: norm(u.email) })
    }
    if (!data.users?.length || data.users.length < 1000) break
    page += 1
  }
  return found
}

/** Merge rows from several queries, de-duplicated by id. */
function mergeById(...lists) {
  const map = new Map()
  for (const list of lists) for (const row of list || []) map.set(row.id, row)
  return [...map.values()]
}

async function main() {
  console.log(`\n=== Deepcast test-data reset ${DRY_RUN ? '(DRY RUN — no changes)' : '(LIVE)'} ===`)
  console.log('Allowlisted test emails (exact match only):')
  TARGET_EMAILS.forEach((e) => console.log(`   - ${e}`))

  // Allowlist sanity: never allow a protected email through.
  for (const e of TARGET_EMAILS) {
    if (PROTECTED_EMAILS.includes(e)) fail(`Allowlist contains a protected email (${e}). Aborting.`)
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')

  const supabase = createClient(url, key)

  // Resolve the filmmaker + film read-only. Abort on anything unexpected.
  const { data: filmmaker } = await supabase
    .from('users')
    .select('id, email, name, role')
    .ilike('email', 'filmmaker@gmail.com')
    .maybeSingle()
  if (!filmmaker || filmmaker.role !== 'creator') fail('Filmmaker (creator) account not found.')

  const { data: film } = await supabase
    .from('films')
    .select('id, title, creator_id')
    .ilike('title', FILM_TITLE)
    .maybeSingle()
  if (!film) fail(`Film "${FILM_TITLE}" not found.`)
  if (norm(filmmaker.email) !== 'filmmaker@gmail.com') fail('Resolved filmmaker email mismatch.')
  if (film.creator_id !== filmmaker.id) fail(`Film "${FILM_TITLE}" is not owned by the filmmaker.`)

  console.log(`\nFilmmaker: ${filmmaker.email} (${filmmaker.id})`)
  console.log(`Film:      ${film.title} (${film.id})`)

  /* ---- collect everything tied to the 5 (and ONLY the 5) ---- */

  const authUsers = await listAuthUsersByEmail(supabase, TARGET_EMAILS)
  const authIds = authUsers.map((u) => u.id)
  if (authIds.includes(filmmaker.id)) fail('SAFETY: filmmaker id resolved into the delete set. Aborting.')

  const [{ data: profByEmail }, profById] = await Promise.all([
    supabase.from('users').select('id, email').in('email', TARGET_EMAILS),
    authIds.length
      ? supabase.from('users').select('id, email').in('id', authIds)
      : Promise.resolve({ data: [] }),
  ])
  const profiles = mergeById(profByEmail, profById.data).filter((p) => p.id !== filmmaker.id)

  const [invRecv, invSentEmail, invSentId] = await Promise.all([
    supabase.from('invites').select('id, token, recipient_email, sender_email, sender_id, parent_invite_id').in('recipient_email', TARGET_EMAILS),
    supabase.from('invites').select('id, token, recipient_email, sender_email, sender_id, parent_invite_id').in('sender_email', TARGET_EMAILS),
    authIds.length
      ? supabase.from('invites').select('id, token, recipient_email, sender_email, sender_id, parent_invite_id').in('sender_id', authIds)
      : Promise.resolve({ data: [] }),
  ])
  const targetInvites = mergeById(invRecv.data, invSentEmail.data, invSentId.data)
  const targetInviteIds = targetInvites.map((i) => i.id)
  const targetInviteIdSet = new Set(targetInviteIds)

  // SAFETY: refuse if a NON-target invite is a child of a target invite (would force touching it).
  if (targetInviteIds.length) {
    const { data: children } = await supabase
      .from('invites')
      .select('id, recipient_email, parent_invite_id')
      .in('parent_invite_id', targetInviteIds)
    const nonTargetChildren = (children || []).filter((c) => !targetInviteIdSet.has(c.id))
    if (nonTargetChildren.length) {
      console.error('\nNon-target invites depend on target invites:')
      nonTargetChildren.forEach((c) => console.error(`   - ${c.id} (recipient ${c.recipient_email})`))
      fail('Refusing to delete to avoid touching non-target data.')
    }
  }

  const tokens = targetInvites.map((i) => i.token).filter(Boolean)
  const [wsByViewer, wsByToken] = await Promise.all([
    authIds.length
      ? supabase.from('watch_sessions').select('id, viewer_id, invite_token').in('viewer_id', authIds)
      : Promise.resolve({ data: [] }),
    tokens.length
      ? supabase.from('watch_sessions').select('id, viewer_id, invite_token').in('invite_token', tokens)
      : Promise.resolve({ data: [] }),
  ])
  const watchSessions = mergeById(wsByViewer.data, wsByToken.data)

  /* ---- report ---- */

  console.log('\n— Scope —')
  console.log(`  auth users:     ${authUsers.length}${authUsers.length ? ' (' + authUsers.map((u) => u.email).join(', ') + ')' : ''}`)
  console.log(`  profile rows:   ${profiles.length}`)
  console.log(`  invites:        ${targetInvites.length}`)
  console.log(`  watch_sessions: ${watchSessions.length}`)

  /* ---- delete ---- */

  console.log('\n— Cleanup —')

  if (watchSessions.length) {
    console.log(`${tag} delete ${watchSessions.length} watch_session(s)`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('watch_sessions').delete().in('id', watchSessions.map((w) => w.id))
      if (error) fail(`watch_sessions delete failed: ${error.message}`)
    }
  } else {
    console.log('  no watch_sessions to delete')
  }

  if (targetInvites.length) {
    console.log(`${tag} delete ${targetInvites.length} invite(s): ${targetInvites.map((i) => i.token).join(', ')}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('invites').delete().in('id', targetInviteIds)
      if (error) fail(`invites delete failed: ${error.message}`)
    }
  } else {
    console.log('  no invites tied to the allowlist to delete')
  }

  if (profiles.length) {
    console.log(`${tag} delete ${profiles.length} profile row(s): ${profiles.map((p) => p.email).join(', ')}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').delete().in('id', profiles.map((p) => p.id))
      if (error) fail(`profiles delete failed: ${error.message}`)
    }
  } else {
    console.log('  no profile rows to delete')
  }

  if (authUsers.length) {
    console.log(`${tag} delete ${authUsers.length} auth user(s): ${authUsers.map((u) => u.email).join(', ')}`)
    if (!DRY_RUN) {
      for (const u of authUsers) {
        const { error } = await supabase.auth.admin.deleteUser(u.id)
        if (error) fail(`auth user delete failed (${u.email}): ${error.message}`)
      }
    }
  } else {
    console.log('  no auth users to delete')
  }

  /* ---- recreate pristine filmmaker invites to the 5 ---- */

  console.log('\n— Fresh invites (filmmaker → test email, unopened) —')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

  const urls = []
  for (const email of TARGET_EMAILS) {
    const token = genToken()
    const recipientName = titleCaseLocalPart(email)
    const localUrl = `${BASE_URL}/i/${token}`
    const prodUrl = `${PROD_BASE_URL}/i/${token}`

    if (DRY_RUN) {
      console.log(`  [dry-run] would create invite → ${email} (fresh token on live run)`)
    } else {
      const { error } = await supabase.from('invites').insert({
        film_id: film.id,
        sender_id: filmmaker.id,
        sender_name: filmmaker.name || 'Filmmaker',
        sender_email: 'filmmaker@gmail.com',
        recipient_email: email,
        recipient_name: recipientName,
        token,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        parent_invite_id: null,
      })
      if (error) fail(`invite create failed (${email}): ${error.message}`)
      urls.push({ email, localUrl, prodUrl })
    }
  }

  console.log('\n=== Done ===')
  if (DRY_RUN) {
    console.log('Dry run only — nothing was changed. Re-run without --dry-run to apply.')
  } else {
    console.log('Fresh invite URLs to test with (same token works on both origins):\n')
    for (const { email, localUrl, prodUrl } of urls) {
      console.log(`  ${email}`)
      console.log(`    Local:      ${localUrl}`)
      console.log(`    Production: ${prodUrl}\n`)
    }
    console.log(`(Local base: ${BASE_URL} — override with APP_URL. Production base: ${PROD_BASE_URL}.)`)
  }
}

main().catch((err) => {
  console.error('\n✖ reset failed:', err?.message || err)
  process.exit(1)
})
