/**
 * One-time orphan-row cleanup (approved by Ien, 2026-07-22).
 *
 * Deletes EXACTLY FOUR invite rows that admin Remove cannot reach:
 *   1. The legacy "Ien" email invite on A Sacred Pause and the legacy "Dan"
 *      email invite on The New Narrative — both addressed to
 *      filmmaker@gmail.com, so the admin surface refuses them (they look
 *      like the protected creator).
 *   2. The two voided links vera-fx7m and refundo-ewbj — invisible in admin
 *      by design (Fix B), with no deletable person behind them.
 *
 * The "Ien" row has ONE child: Jon's real invite. It is SPLICED to the
 * row's own parent (the film root) before the delete, exactly as the admin
 * engine would — Jon's lineage stays intact.
 *
 * SAFETY (house rules):
 *   - DRY-RUN BY DEFAULT; --execute requires typing the confirmation phrase.
 *   - HARD-CODED to these four row ids. Anything else is untouchable.
 *   - Every row's CURRENT state must match the state recorded at approval
 *     time (film, status, recipient, slug, children) — ANY drift refuses
 *     the whole run.
 *   - Deletes invite rows and their watch_sessions ONLY. Never touches the
 *     users table (asserted: none of the four rows carries an account).
 *   - THE OWNER runs --execute personally.
 */
import 'dotenv/config'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

const EXECUTE = process.argv.includes('--execute')
const CONFIRM_PHRASE = 'DELETE ORPHAN ROWS'

/** The four rows, exactly as diagnosed and approved on 2026-07-22. */
const APPROVED_ROWS = [
  {
    id: '0a5fa60a-1316-4b37-92ed-92f907a16da9',
    label: 'A Sacred Pause — legacy email invite "Ien" to filmmaker@gmail.com',
    expect: {
      film_id: '7c42093d-d5eb-4a38-a9fa-d28ca41d7b0f',
      status: 'opened',
      recipient_email: 'filmmaker@gmail.com',
      recipient_name: 'Ien',
      link_slug: null,
    },
    // Jon's real invite — spliced to this row's own parent before deletion.
    expectedChildIds: ['713570fc-cb10-4019-9fa4-72f8ab1979e6'],
  },
  {
    id: '13b9e879-b411-4ed7-a960-00a1adb4f1e5',
    label: 'The New Narrative — legacy email invite "Dan" to filmmaker@gmail.com',
    expect: {
      film_id: '80df945a-6fb7-416b-ad73-3fab4b9cadf8',
      status: 'opened',
      recipient_email: 'filmmaker@gmail.com',
      recipient_name: 'Dan',
      link_slug: null,
    },
    expectedChildIds: [],
  },
  {
    id: '7ff861f7-2698-4e08-8550-b1c62beba89f',
    label: 'The New Narrative — voided link vera-fx7m',
    expect: {
      film_id: '80df945a-6fb7-416b-ad73-3fab4b9cadf8',
      status: 'void',
      recipient_email: null,
      recipient_name: 'Vera',
      link_slug: 'vera-fx7m',
    },
    expectedChildIds: [],
  },
  {
    id: '77830883-330d-4a01-b90b-e78958fe6df8',
    label: 'The New Narrative — voided link refundo-ewbj',
    expect: {
      film_id: '80df945a-6fb7-416b-ad73-3fab4b9cadf8',
      status: 'void',
      recipient_email: null,
      recipient_name: 'Refundo',
      link_slug: 'refundo-ewbj',
    },
    expectedChildIds: [],
  },
]

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
  const ids = APPROVED_ROWS.map((r) => r.id)
  const [{ data: rows, error: rErr }, { data: children, error: cErr }] = await Promise.all([
    supabase
      .from('invites')
      .select(
        'id, film_id, status, recipient_email, recipient_name, link_slug, token, claimed_email, claimed_by, parent_invite_id'
      )
      .in('id', ids),
    supabase.from('invites').select('id, parent_invite_id, recipient_name').in('parent_invite_id', ids),
  ])
  if (rErr || cErr) fail(rErr?.message || cErr?.message)

  const rowById = new Map((rows || []).map((r) => [r.id, r]))
  const childrenByParent = new Map()
  for (const c of children || []) {
    if (!childrenByParent.has(c.parent_invite_id)) childrenByParent.set(c.parent_invite_id, [])
    childrenByParent.get(c.parent_invite_id).push(c)
  }

  // ── State verification: any drift from the approved snapshot refuses ALL. ──
  const plan = []
  for (const approved of APPROVED_ROWS) {
    const row = rowById.get(approved.id)
    if (!row) {
      fail(`${approved.label}\n  Row ${approved.id} no longer exists — state changed since approval. Refusing everything.`)
    }
    for (const [field, expected] of Object.entries(approved.expect)) {
      const actual = row[field] ?? null
      if (actual !== expected) {
        fail(
          `${approved.label}\n  ${field} is now ${JSON.stringify(actual)} (approved as ${JSON.stringify(expected)}) — state changed. Refusing everything.`
        )
      }
    }
    if (row.claimed_by != null || row.claimed_email) {
      fail(`${approved.label}\n  Row now carries a claim — state changed. Refusing everything.`)
    }
    const kids = (childrenByParent.get(approved.id) || []).map((c) => c.id).sort()
    const expectedKids = [...approved.expectedChildIds].sort()
    if (JSON.stringify(kids) !== JSON.stringify(expectedKids)) {
      fail(
        `${approved.label}\n  Children are now [${kids.join(', ')}] (approved as [${expectedKids.join(', ')}]) — state changed. Refusing everything.`
      )
    }

    const { count: sessionCount, error: wsErr } = await supabase
      .from('watch_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('invite_token', row.token)
    if (wsErr) fail(`watch_sessions lookup failed: ${wsErr.message}`)
    plan.push({ approved, row, watchSessions: sessionCount || 0 })
  }

  console.log(`\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} — exactly these four rows, verified against the approved snapshot:\n`)
  for (const p of plan) {
    console.log(`  ${p.approved.label}`)
    console.log(
      `    invite ${p.row.id} (status ${p.row.status}) + ${p.watchSessions} watch session(s)`
    )
    for (const childId of p.approved.expectedChildIds) {
      console.log(
        `    → child ${childId} (Jon) re-points to ${p.row.parent_invite_id ?? 'the film root (NULL)'} BEFORE the delete`
      )
    }
  }
  console.log('\n  Users table: untouched (none of these rows carries an account).')

  if (!EXECUTE) {
    console.log('\nDry run only — nothing written. Re-run with --execute to apply (owner only).')
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to delete the 4 rows above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  // 1) Splice children first (Jon's lineage stays whole).
  for (const p of plan) {
    for (const childId of p.approved.expectedChildIds) {
      const { error } = await supabase
        .from('invites')
        .update({ parent_invite_id: p.row.parent_invite_id ?? null })
        .eq('id', childId)
        .eq('parent_invite_id', p.row.id)
      if (error) fail(`splice failed for child ${childId}: ${error.message}`)
      console.log(`  ✓ spliced child ${childId}`)
    }
  }

  // 2) Watch sessions, then the invite rows.
  for (const p of plan) {
    if (p.watchSessions > 0) {
      const { error } = await supabase.from('watch_sessions').delete().eq('invite_token', p.row.token)
      if (error) fail(`watch_sessions delete failed for ${p.row.id}: ${error.message}`)
    }
    const { error } = await supabase.from('invites').delete().eq('id', p.row.id)
    if (error) fail(`invite delete failed for ${p.row.id}: ${error.message}`)
    console.log(`  ✓ deleted ${p.approved.label}`)
  }
  console.log('\nDone — 4 rows removed, users untouched.')
}

main().catch((err) => fail(err?.message || String(err)))
