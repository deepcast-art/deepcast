/**
 * Demo-film seeder — creates ONE new demo film plus a believable, organic share
 * tree of ~50 fake viewers (invite rows) for it. INSERT-ONLY.
 *
 * What it creates:
 *   1. One films row: "A Sacred Pause" (status 'ready'), owned by the given creator.
 *   2. ~50 invites for that film, forming an uneven 2–3-level-deep share tree:
 *        - ~6 origin viewers the filmmaker shared to directly (root invites,
 *          parent_invite_id = null, sender_id = the creator),
 *        - each branching outward unevenly (some branches deeper than others).
 *      The recipients are fake, account-less people on the reserved-TLD domain
 *      "@demo-deepcast.invalid", so they can NEVER collide with real users or the
 *      reset script's allowlisted test emails. No users rows are created.
 *
 * Why invite.status (not watch_sessions): the network map's "N watched" count and
 * the dashboard stats both read invite.status only (src/lib/filmStats.js →
 * isInviteWatched = status in {watched, signed_up}); watch_sessions is not consulted
 * for any displayed count. So believable watch numbers come purely from the statuses
 * set on the invite rows. (Internal nodes — anyone who shared onward — are always
 * watched/signed_up, since you can't pass on a film you never opened.)
 *
 * Hard safety guarantees:
 *   - INSERT-ONLY. Never updates or deletes any existing row.
 *   - Never writes to public.users (fake recipients have no accounts).
 *   - Touches exactly ONE film — the one it creates — and only invites carrying
 *     that new film_id.
 *   - Reads (never modifies) the creator account, and ABORTS if a film with this
 *     title or playback id already exists (run the teardown script first).
 *   - DRY RUN BY DEFAULT: prints the film, the tree shape, sample rows and totals,
 *     and changes NOTHING. Writing requires `--execute` AND typing the confirmation
 *     phrase interactively (same pattern as cleanup-test-nodes.js).
 *   - Deterministic (fixed seed): the dry-run preview is exactly what --execute creates.
 *
 * Usage:
 *   node server/seed-demo-film.js              # dry run (default) — no writes
 *   node server/seed-demo-film.js --execute    # writes, after typed confirmation
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (.env is loaded).
 */
import 'dotenv/config'
import crypto from 'crypto'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

/* ----------------------------- configuration ----------------------------- */

const FILM_TITLE = 'A Sacred Pause'
const FILM_PLAYBACK_ID = '6GMWj01CjP01Y1ee001Vd2qYqUPJtEOgUYz00nG02BYE9F9E'
const FILM_CREATOR_ID = '67b6d7aa-3438-4be5-b317-7556b7cac193'
const FILM_STATUS = 'ready'

// Reserved-TLD, clearly-fake domain. DELIBERATELY different from the protected
// seeded-graph nodes' "@demo.invalid" so the two sets can never be confused.
const DEMO_DOMAIN = 'demo-deepcast.invalid'

const TARGET_NODES = 50
const ROOT_COUNT = 6
const MAX_DEPTH = 4 // roots are depth 1, so up to 3 levels below the roots
const SEED = 0x5ac4ed // fixed → reproducible tree (dry run == execute)

// Invite links never expire in the MVP; this far-future value mirrors reset-test-data.js.
const INVITE_EXPIRY_DAYS = 3650

const CONFIRM_PHRASE = 'SEED DEMO FILM'
const EXECUTE = process.argv.includes('--execute')

const BASE_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')
const PROD_BASE_URL = 'https://deepcast.art'

/* ------------------------------- helpers --------------------------------- */

const norm = (e) => String(e || '').trim().toLowerCase()
const genToken = () => crypto.randomBytes(16).toString('hex')

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

/** Small deterministic PRNG (mulberry32) so the generated tree is reproducible. */
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/* Realistic name pool (≥ TARGET_NODES distinct "First Last" combinations). */
const FIRST_NAMES = [
  'Maya', 'Daniel', 'Priya', 'Marcus', 'Elena', 'Jonah', 'Aisha', 'Theo', 'Nina', 'Caleb',
  'Sofia', 'Ruben', 'Hana', 'Oscar', 'Leah', 'Amir', 'Clara', 'Felix', 'Yara', 'Ivan',
  'Tessa', 'Diego', 'Maren', 'Quinn', 'Rosa', 'Silas', 'Imani', 'Levi', 'Greta', 'Omar',
]
const LAST_NAMES = [
  'Okafor', 'Reyes', 'Sharma', 'Bennett', 'Castillo', 'Park', 'Haddad', 'Lindqvist', 'Moreau', 'Nguyen',
  'Romano', 'Adeyemi', 'Kowalski', 'Petrov', 'Mensah', 'Tanaka', 'Flores', 'Bauer', 'Sato', 'Costa',
  'Ferreira', 'Novak', 'Halloran', 'Vargas', 'Dube', 'Iqbal', 'Lund', 'Mbeki', 'Rossi', 'Ortega',
]

function buildNamePool(size) {
  const names = []
  const used = new Set()
  // Walk all FIRST × LAST combinations (30 × 30 = 900). The first name cycles
  // within each block of 30; the surname ROTATES by the block index so every
  // block pairs each first name with a different surname. That spreads surnames
  // evenly from the very first node (no single surname clusters at the start),
  // keeps every full name unique, and still reaches any reasonable `size`.
  const total = FIRST_NAMES.length * LAST_NAMES.length
  for (let i = 0; i < total && names.length < size; i++) {
    const row = i % FIRST_NAMES.length
    const block = Math.floor(i / FIRST_NAMES.length)
    const first = FIRST_NAMES[row]
    const last = LAST_NAMES[(row + block) % LAST_NAMES.length]
    const full = `${first} ${last}`
    if (!used.has(full)) {
      used.add(full)
      names.push(full)
    }
  }
  if (names.length < size) {
    throw new Error(
      `name pool exhausted: need ${size} unique names but FIRST_NAMES × LAST_NAMES only yields ${total}.`
    )
  }
  return names
}

const NOTES = [
  'This one stayed with me for days — I think it will land for you too.',
  'Watched it twice. Wanted you to have it before we talk next.',
  'Felt like it was made for exactly where you are right now.',
  'No rush — but find a quiet hour for this one.',
  'You came to mind in the very first scene.',
  'A small, quiet film. I think you will get it.',
  'Saving you a seat at the fire for this one.',
  'Trust me on this — give it ten minutes.',
]

/* ------------------------------ tree builder ----------------------------- */

function buildTree() {
  const rng = mulberry32(SEED)
  const names = buildNamePool(TARGET_NODES + 10)
  const nodes = []
  const now = Date.now()

  const makeNode = (depth, parentIdx, createdAtMs) => {
    const idx = nodes.length
    const name = names[idx]
    const [first, last] = name.split(' ')
    const nn = String(idx).padStart(2, '0')
    const email = norm(`${first}.${last}.${nn}@${DEMO_DOMAIN}`)
    const clamped = Math.min(createdAtMs, now - DAY_MS) // always at least a day in the past
    const node = {
      idx,
      depth,
      parentIdx,
      name,
      email,
      token: genToken(),
      createdAt: new Date(clamped),
      note: NOTES[idx % NOTES.length],
      status: null, // assigned after the shape is known
    }
    nodes.push(node)
    return node
  }

  // Roots: origin viewers the filmmaker shared to directly, spread ~28→20 days ago.
  const queue = []
  for (let r = 0; r < ROOT_COUNT; r++) {
    const daysAgo = 28 - r * 1.4 - rng() * 0.8
    queue.push(makeNode(1, null, now - daysAgo * DAY_MS))
  }

  // Breadth-first branching, uneven by depth (deeper → fewer/less likely to share).
  const childCountFor = (depth) => {
    const roll = rng()
    if (depth === 1) return roll < 0.15 ? 0 : 2 + Math.floor(rng() * 4) // 0, or 2–5
    if (depth === 2) return roll < 0.4 ? 0 : 1 + Math.floor(rng() * 3) // 0, or 1–3
    return roll < 0.7 ? 0 : 1 + Math.floor(rng() * 2) // depth 3: 0, or 1–2
  }

  while (nodes.length < TARGET_NODES && queue.length) {
    const parent = queue.shift()
    if (parent.depth >= MAX_DEPTH) continue
    let childCount = childCountFor(parent.depth)
    childCount = Math.min(childCount, TARGET_NODES - nodes.length)
    for (let k = 0; k < childCount; k++) {
      const gapDays = 1 + Math.floor(rng() * 5) // child received after its parent
      const child = makeNode(parent.depth + 1, parent.idx, parent.createdAt.getTime() + gapDays * DAY_MS)
      queue.push(child)
    }
  }

  // Status assignment. Internal nodes (anyone who shared onward) must have engaged,
  // so they are watched/signed_up. Leaves get a realistic spread.
  const hasChild = new Set(nodes.filter((n) => n.parentIdx != null).map((n) => n.parentIdx))
  for (const n of nodes) {
    if (hasChild.has(n.idx)) {
      n.status = rng() < 0.35 ? 'signed_up' : 'watched'
    } else {
      const r = rng()
      n.status = r < 0.45 ? 'watched' : r < 0.7 ? 'opened' : r < 0.82 ? 'signed_up' : 'pending'
    }
  }

  return nodes
}

/** Index of the root ancestor for a node (walks parent pointers). */
function rootOf(nodes, node) {
  let cur = node
  while (cur.parentIdx != null) cur = nodes[cur.parentIdx]
  return cur.idx
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  console.log(`\n=== Deepcast demo-film seed ${EXECUTE ? '(EXECUTE)' : '(DRY RUN — no changes)'} ===`)

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')
  const supabase = createClient(url, key)

  /* ---- resolve the creator (read-only) ---- */
  const { data: creator, error: creatorErr } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', FILM_CREATOR_ID)
    .maybeSingle()
  if (creatorErr) fail(`creator lookup failed: ${creatorErr.message}`)
  if (!creator) fail(`Creator ${FILM_CREATOR_ID} not found in public.users.`)
  if (creator.role !== 'creator') fail(`User ${FILM_CREATOR_ID} is role "${creator.role}", not "creator".`)

  /* ---- duplicate-film guard (read-only) ---- */
  const { data: dupes, error: dupErr } = await supabase
    .from('films')
    .select('id, title, mux_playback_id')
    .or(`mux_playback_id.eq.${FILM_PLAYBACK_ID},title.eq.${FILM_TITLE}`)
  if (dupErr) fail(`duplicate-film check failed: ${dupErr.message}`)
  if (dupes && dupes.length) {
    console.error('\nA film with this title or playback id already exists:')
    dupes.forEach((f) => console.error(`   - ${f.title} (${f.id})`))
    fail('Refusing to create a duplicate demo film. Run server/teardown-demo-film.js first.')
  }

  /* ---- build the tree in memory ---- */
  const nodes = buildTree()
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * DAY_MS).toISOString()

  /* ---- report ---- */
  console.log(`\nCreator: ${creator.email} (${creator.id})`)
  console.log('\n— Film to create —')
  console.log(`  title:           ${FILM_TITLE}`)
  console.log(`  mux_playback_id: ${FILM_PLAYBACK_ID}`)
  console.log(`  creator_id:      ${FILM_CREATOR_ID}`)
  console.log(`  status:          ${FILM_STATUS}`)
  console.log('  description / gif_start / gif_end: (left null)')

  const byDepth = new Map()
  for (const n of nodes) byDepth.set(n.depth, (byDepth.get(n.depth) || 0) + 1)
  const statusCounts = nodes.reduce((acc, n) => ((acc[n.status] = (acc[n.status] || 0) + 1), acc), {})
  const watchedCount = nodes.filter((n) => n.status === 'watched' || n.status === 'signed_up').length

  console.log(`\n— Share tree (${nodes.length} invites total) —`)
  const roots = nodes.filter((n) => n.parentIdx == null)
  for (const root of roots) {
    const subtree = nodes.filter((n) => rootOf(nodes, n) === root.idx).length
    console.log(`  origin "${root.name}" → ${subtree} node(s) in its branch`)
  }
  console.log('\n  depth distribution (depth 1 = origin viewers):')
  ;[...byDepth.keys()].sort((a, b) => a - b).forEach((d) => console.log(`     depth ${d}: ${byDepth.get(d)}`))
  console.log('\n  status mix:')
  Object.entries(statusCounts).forEach(([s, c]) => console.log(`     ${s.padEnd(9)} ${c}`))
  console.log(`  → network map "watched" would show: ${watchedCount}`)

  console.log('\n— Sample rows (first 8) —')
  nodes.slice(0, 8).forEach((n) => {
    const parent = n.parentIdx == null ? '(root — filmmaker)' : nodes[n.parentIdx].name
    console.log(
      `  d${n.depth} ${n.name} <${n.email}>  status=${n.status}  ` +
        `parent=${parent}  created=${n.createdAt.toISOString().slice(0, 10)}`
    )
  })

  if (!EXECUTE) {
    console.log('\n=== DRY RUN complete — nothing was changed. ===')
    console.log('To create the demo film + tree, the owner runs:  node server/seed-demo-film.js --execute')
    return
  }

  /* ---- interactive confirmation ---- */
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to create the film and ${nodes.length} invites: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  /* ---- insert the film ---- */
  const { data: film, error: filmErr } = await supabase
    .from('films')
    .insert({
      title: FILM_TITLE,
      mux_playback_id: FILM_PLAYBACK_ID,
      creator_id: FILM_CREATOR_ID,
      status: FILM_STATUS,
    })
    .select('id')
    .single()
  if (filmErr || !film?.id) fail(`film insert failed: ${filmErr?.message || 'no id returned'}`)
  console.log(`\n✓ created film ${film.id}`)

  /* ---- insert invites in idx order (parents always before their children) ---- */
  const idMap = new Map() // node.idx -> real invite id
  for (const n of nodes) {
    const isRoot = n.parentIdx == null
    const parentNode = isRoot ? null : nodes[n.parentIdx]
    const row = {
      film_id: film.id,
      sender_id: isRoot ? creator.id : null,
      sender_name: isRoot ? creator.name || 'Filmmaker' : parentNode.name,
      sender_email: isRoot ? creator.email : parentNode.email,
      recipient_email: n.email,
      recipient_name: n.name,
      personal_note: n.note,
      token: n.token,
      status: n.status,
      expires_at: expiresAt,
      parent_invite_id: isRoot ? null : idMap.get(n.parentIdx),
      created_at: n.createdAt.toISOString(),
    }
    const { data: inserted, error: invErr } = await supabase
      .from('invites')
      .insert(row)
      .select('id')
      .single()
    if (invErr || !inserted?.id) fail(`invite insert failed (${n.email}): ${invErr?.message || 'no id returned'}`)
    idMap.set(n.idx, inserted.id)
  }
  console.log(`✓ created ${idMap.size} invites`)

  console.log('\n=== Done ===')
  console.log(`New film id: ${film.id}`)
  console.log(`View its network: /network?filmId=${film.id}`)
  console.log(`   Local:      ${BASE_URL}/network?filmId=${film.id}`)
  console.log(`   Production: ${PROD_BASE_URL}/network?filmId=${film.id}`)
  console.log(`\nTo remove everything this created: node server/teardown-demo-film.js --id=${film.id}`)
}

main().catch((err) => {
  console.error('\n✖ seed failed:', err?.message || err)
  process.exit(1)
})
