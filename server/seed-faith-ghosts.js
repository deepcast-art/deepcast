/**
 * Faith Dialogues ghost seeder — creates a believable, organic share tree of
 * ~50 fake viewers (invite rows) for the EXISTING film "The Faith Dialogues".
 * INSERT-ONLY, invites only: unlike seed-demo-film.js (its direct ancestor,
 * whose conventions this mirrors), it NEVER creates a films row — the film
 * was inserted by the owner on 2026-07-22 and this script refuses to run if
 * that exact row cannot be found.
 *
 * What it creates:
 *   ~50 invites for film 6a9c0c79-24f6-427e-ba34-c113acf92d9f, forming an
 *   uneven multi-level share tree (same shape rules as the A Sacred Pause
 *   ghosts): ~6 origin viewers the filmmaker shared to directly (root
 *   invites, parent_invite_id = null, sender_id = the film's creator), each
 *   branching outward unevenly, up to 3 levels below the roots. Recipients
 *   are fake, account-less people on the reserved-TLD ghost domain
 *   "@demo-deepcast.invalid" — the SAME domain as the A Sacred Pause ghosts,
 *   because ghost detection is domain-based (src/lib/demoGhosts.js) — with an
 *   "fd" marker in the local part (maya.okafor.fd00@…) so the two films'
 *   ghost sets stay visually distinct. No users rows are created.
 *
 * Ghosts are NEVER ticket-numbered — the guarantee is two-layered:
 *   1. This script never writes ticket_no and never calls next_ticket_no()
 *      (numbers are minted only at real link generation in server/index.js).
 *   2. needsTicketNumber (src/lib/inviteExistence.js) refuses any row whose
 *      recipient_email ends in a ghost domain (src/lib/demoGhosts.js), so no
 *      backfill can ever number these rows either.
 *
 * Hard safety guarantees:
 *   - INSERT-ONLY. Never updates or deletes any existing row.
 *   - Never writes to public.users or public.films.
 *   - Touches exactly ONE film: hardcoded id 6a9c0c79-…, and ABORTS unless
 *     that row exists AND carries the expected Mux playback id (identity
 *     check against pointing at the wrong database).
 *   - IDEMPOTENT: if ANY ghost-domain invites already exist on this film,
 *     it aborts with the count and changes nothing — no partial top-ups.
 *   - No team_creator_id / unlimited_shares machinery anywhere: root rows
 *     carry sender_id = the creator (the canonical graph model attaches
 *     creator-sent invites to the center), ghost-to-ghost rows carry only
 *     the parent link. Wallets are untouched (ghosts spend nothing).
 *   - DRY RUN BY DEFAULT: prints the FULL tree it would create (every node:
 *     name, parent, depth, status, timestamp) and changes NOTHING. Writing
 *     requires `--execute` AND typing the confirmation phrase interactively
 *     (same pattern as reset-test-data.js).
 *   - Deterministic (fixed seed): the dry-run preview is exactly what
 *     --execute creates.
 *
 * Usage:
 *   node server/seed-faith-ghosts.js              # dry run (default) — no writes
 *   node server/seed-faith-ghosts.js --execute    # writes, after typed confirmation
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment (.env is loaded).
 */
import 'dotenv/config'
import crypto from 'crypto'
import readline from 'readline'
import { createClient } from '@supabase/supabase-js'

/* ----------------------------- configuration ----------------------------- */

const FILM_ID = '6a9c0c79-24f6-427e-ba34-c113acf92d9f' // The Faith Dialogues
const FILM_PLAYBACK_ID = '4HnHRG3NAf9YYR7V1fNs0143gGJnLUZ9F1umQuXsOaaQ' // identity check only

// Reserved-TLD ghost domain. MUST stay one of the two domains in
// src/lib/demoGhosts.js — that module is what makes these rows ghosts
// (hidden per show_ghosts, never ticket-numbered).
const DEMO_DOMAIN = 'demo-deepcast.invalid'
// Distinguishes this film's ghost emails from A Sacred Pause's
// (name.fd00@ vs name.00@) without changing the domain the detection keys on.
const EMAIL_MARKER = 'fd'

const TARGET_NODES = 50
const ROOT_COUNT = 6
const MAX_DEPTH = 4 // roots are depth 1, so up to 3 levels below the roots
const SEED = 0xfa17d1 // fixed → reproducible tree (dry run == execute); differs from seed-demo-film

// Invite links never expire in the MVP; this far-future value mirrors reset-test-data.js.
const INVITE_EXPIRY_DAYS = 3650
const DAY_MS = 24 * 60 * 60 * 1000

const CONFIRM_PHRASE = 'SEED FAITH GHOSTS'
const EXECUTE = process.argv.includes('--execute')

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

/* Realistic name pool (same pools as seed-demo-film.js; the assignment is
   shuffled with the seeded PRNG below so this film's ghosts are different
   people, in a different order, than the A Sacred Pause set). */
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

function buildNamePool(size, rng) {
  const names = []
  const used = new Set()
  const total = FIRST_NAMES.length * LAST_NAMES.length
  for (let i = 0; i < total && names.length < size * 3; i++) {
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
  // Fisher–Yates with the seeded PRNG: deterministic, but a different cast
  // and ordering than the unshuffled A Sacred Pause assignment.
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  return names.slice(0, size)
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
  const names = buildNamePool(TARGET_NODES + 10, rng)
  const nodes = []
  const now = Date.now()

  const makeNode = (depth, parentIdx, createdAtMs) => {
    const idx = nodes.length
    const name = names[idx]
    const [first, last] = name.split(' ')
    const nn = String(idx).padStart(2, '0')
    const email = norm(`${first}.${last}.${EMAIL_MARKER}${nn}@${DEMO_DOMAIN}`)
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
  console.log(`\n=== Faith Dialogues ghost seed ${EXECUTE ? '(EXECUTE)' : '(DRY RUN — no changes)'} ===`)

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) fail('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
  if (jwtRole(key) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY is not a service_role key.')
  const supabase = createClient(url, key)

  /* ---- resolve the film (read-only) — hard identity check ---- */
  const { data: film, error: filmErr } = await supabase
    .from('films')
    .select('id, title, creator_id, mux_playback_id, show_ghosts')
    .eq('id', FILM_ID)
    .maybeSingle()
  if (filmErr) fail(`film lookup failed: ${filmErr.message}`)
  if (!film) fail(`Film ${FILM_ID} (The Faith Dialogues) not found. The owner inserts the film row first; this script only seeds its ghosts.`)
  if (film.mux_playback_id !== FILM_PLAYBACK_ID) {
    fail(
      `Film ${FILM_ID} exists but its mux_playback_id (${film.mux_playback_id}) is not the expected ` +
        `Faith Dialogues playback id. Refusing to seed — this may be the wrong database or the wrong row.`
    )
  }

  /* ---- resolve the film's creator (read-only) ---- */
  const { data: creator, error: creatorErr } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', film.creator_id)
    .maybeSingle()
  if (creatorErr) fail(`creator lookup failed: ${creatorErr.message}`)
  if (!creator) fail(`Film creator ${film.creator_id} not found in public.users.`)
  if (creator.role !== 'creator') fail(`User ${film.creator_id} is role "${creator.role}", not "creator".`)

  /* ---- idempotency guard (read-only): any existing ghosts → abort ---- */
  const { data: existingGhosts, error: ghostErr } = await supabase
    .from('invites')
    .select('id, recipient_email')
    .eq('film_id', FILM_ID)
    .or('recipient_email.ilike.%@demo-deepcast.invalid,recipient_email.ilike.%@demo.invalid')
  if (ghostErr) fail(`existing-ghost check failed: ${ghostErr.message}`)
  if (existingGhosts && existingGhosts.length) {
    fail(
      `This film already has ${existingGhosts.length} ghost invite(s) — refusing to top up or duplicate. ` +
        'If the set needs rebuilding, that is a separate owner decision.'
    )
  }

  /* ---- build the tree in memory ---- */
  const nodes = buildTree()
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * DAY_MS).toISOString()

  /* ---- report ---- */
  console.log(`\nFilm:    ${film.title} (${film.id})  show_ghosts=${film.show_ghosts}`)
  console.log(`Creator: ${creator.email} (${creator.id})`)
  if (!film.show_ghosts) {
    console.log('  NOTE: show_ghosts is FALSE — these ghosts would appear on admin surfaces only.')
  }

  const byDepth = new Map()
  for (const n of nodes) byDepth.set(n.depth, (byDepth.get(n.depth) || 0) + 1)
  const statusCounts = nodes.reduce((acc, n) => ((acc[n.status] = (acc[n.status] || 0) + 1), acc), {})
  const watchedCount = nodes.filter((n) => n.status === 'watched' || n.status === 'signed_up').length

  console.log(`\n— Share tree (${nodes.length} invites total; ticket_no is NEVER set) —`)
  const roots = nodes.filter((n) => n.parentIdx == null)
  for (const root of roots) {
    const subtree = nodes.filter((n) => rootOf(nodes, n) === root.idx).length
    console.log(`  origin "${root.name}" → ${subtree} node(s) in its branch`)
  }
  console.log('\n  depth distribution (depth 1 = origin viewers):')
  ;[...byDepth.keys()].sort((a, b) => a - b).forEach((d) => console.log(`     depth ${d}: ${byDepth.get(d)}`))
  console.log('\n  status mix:')
  Object.entries(statusCounts).forEach(([s, c]) => console.log(`     ${s.padEnd(9)} ${c}`))
  console.log(`  → "watched" surfaces would show: ${watchedCount}`)

  console.log('\n— Full tree (every row this script would insert) —')
  nodes.forEach((n) => {
    const parent = n.parentIdx == null ? '(root — filmmaker)' : nodes[n.parentIdx].name
    console.log(
      `  d${n.depth} ${String(n.idx).padStart(2, '0')} ${n.name} <${n.email}>  status=${n.status}  ` +
        `parent=${parent}  created=${n.createdAt.toISOString().slice(0, 10)}`
    )
  })

  if (!EXECUTE) {
    console.log('\n=== DRY RUN complete — nothing was changed. ===')
    console.log('To seed the ghosts, the owner runs:  node server/seed-faith-ghosts.js --execute')
    return
  }

  /* ---- interactive confirmation (same pattern as reset-test-data.js) ---- */
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) =>
    rl.question(`\nType "${CONFIRM_PHRASE}" to insert the ${nodes.length} ghost invites above: `, resolve)
  )
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) fail('Confirmation phrase did not match.')

  /* ---- insert invites in idx order (parents always before their children) ---- */
  const idMap = new Map() // node.idx -> real invite id
  for (const n of nodes) {
    const isRoot = n.parentIdx == null
    const parentNode = isRoot ? null : nodes[n.parentIdx]
    const row = {
      film_id: FILM_ID,
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
      // NO ticket_no, ever — ghosts are never numbered (see header).
    }
    const { data: inserted, error: invErr } = await supabase
      .from('invites')
      .insert(row)
      .select('id')
      .single()
    if (invErr || !inserted?.id) fail(`invite insert failed (${n.email}): ${invErr?.message || 'no id returned'}`)
    idMap.set(n.idx, inserted.id)
  }
  console.log(`✓ created ${idMap.size} ghost invites on ${film.title}`)

  console.log('\n=== Done ===')
  console.log('Ghosts render per films.show_ghosts: viewer surfaces only when the flag is true; admin surfaces always.')
}

main().catch((err) => {
  console.error('\n✖ seed failed:', err?.message || err)
  process.exit(1)
})
