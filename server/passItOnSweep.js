/**
 * The pass-it-on sweep's READ side — shared by the hourly tick, the owner's
 * dry-run route and the read-only CLI (server/pass-it-on-dry-run.js), so
 * there is ONE loader and one evaluation for "who would be emailed".
 * Rules: server/passItOnRules.js. Writes (stamp, mint, send) stay in
 * server/index.js beside the reminders' send loop.
 */
import { WATCHED_STATUSES } from '../src/lib/filmStats.js'
import { evaluatePassItOnRows, PASS_IT_ON_MAX_PER_RUN, PASS_IT_ON_AFTER_DAYS } from './passItOnRules.js'
import { maskEmail } from './reminderRules.js'
import { daysBetween } from './ticketEmail.js'
import { isEmailEventsMissing } from './emailEvents.js'
import { buildLineage } from './lineage.js'
import { chainHands } from '../src/lib/handsChain.js'
import { railPathNodes, railPathDescription } from '../src/lib/railPath.js'

const BASE_COLUMNS = 'id, film_id, link_slug, status, claimed_email, claimed_by, recipient_email, recipient_name, sender_id, sender_name, parent_invite_id, created_at, claimed_at, reminder1_sent_at, reminder2_sent_at, ticket_no'
/** The 20260917 columns, each tolerated individually when absent. */
export const OPTIONAL_COLUMNS = Object.freeze(['watched_at', 'pass_it_on_sent_at', 'pass_it_on_skipped_at'])
const FILM_COLUMNS = 'films(id, title, creator_id, mux_playback_id, show_ghosts)'

/** The select list — with the 20260917 columns present (`optional`), or
 *  without the ones the database does not have yet (they then read as
 *  null: nothing has been sent or skipped, so every watched row's anchor is
 *  its claim or its last reminder). */
export function candidateColumns({ migrated = true, optional = migrated ? OPTIONAL_COLUMNS : [] } = {}) {
  return [BASE_COLUMNS, ...optional, FILM_COLUMNS].join(', ')
}

/** Which optional column a missing-column error names, or null. */
export function missingOptionalColumn(error) {
  const msg = String(error?.message || error || '')
  return OPTIONAL_COLUMNS.find((c) => msg.includes(c)) || null
}

/**
 * Load and evaluate every watched, claimed, accounted row. Returns
 * { evaluated, selected, migrated } — `selected` is the capped, ordered
 * due list; `evaluated` carries every reason. Throws on a database error
 * other than the missing-column window.
 */
export async function loadPassItOnCandidates(supabase, now = new Date()) {
  let optional = [...OPTIONAL_COLUMNS]
  const query = () => {
    let q = supabase
      .from('invites')
      .select(candidateColumns({ optional }))
      .in('status', WATCHED_STATUSES)
      .not('claimed_email', 'is', null)
      .not('claimed_by', 'is', null)
      .order('claimed_at', { ascending: true })
      .limit(PASS_IT_ON_MAX_PER_RUN * 80)
    if (optional.includes('pass_it_on_sent_at')) q = q.is('pass_it_on_sent_at', null)
    return q
  }
  let { data: rows, error } = await query()
  // A column the database does not have yet is dropped and the read retried
  // (one column per pass; a message naming none drops them all).
  for (let attempt = 0; error && isEmailEventsMissing(error) && optional.length > 0 && attempt < OPTIONAL_COLUMNS.length; attempt++) {
    const named = missingOptionalColumn(error)
    optional = named ? optional.filter((c) => c !== named) : []
    ;({ data: rows, error } = await query())
  }
  if (error) throw error
  // "Migrated" for SENDING means the stamp column exists — never a send
  // without the once-ever stamp.
  const migrated = optional.includes('pass_it_on_sent_at')
  const list = rows || []
  const filmIds = [...new Set(list.map((r) => r.film_id))]
  const holderIds = [...new Set(list.map((r) => r.claimed_by).filter(Boolean))]
  const creatorIds = [...new Set(list.map((r) => r.films?.creator_id).filter(Boolean))]
  const [holdersRes, walletsRes, invitesRes, creatorsRes] = await Promise.all([
    holderIds.length ? supabase.from('users').select('id, role, team_creator_id, name').in('id', holderIds) : { data: [] },
    holderIds.length ? supabase.from('film_tickets').select('user_id, film_id, balance, unlimited').in('user_id', holderIds) : { data: [] },
    // The film's rows: the same columns the link payload's lineage walk reads
    // (server/lineage.js) plus the onward check's.
    filmIds.length
      ? supabase.from('invites').select('id, film_id, status, parent_invite_id, sender_id, sender_name, recipient_name, recipient_email, created_at').in('film_id', filmIds).limit(10000)
      : { data: [] },
    creatorIds.length ? supabase.from('users').select('id, name').in('id', creatorIds) : { data: [] },
  ])
  for (const r of [holdersRes, walletsRes, invitesRes, creatorsRes]) if (r.error) throw r.error
  const filmsById = {}
  for (const r of list) if (r.films) filmsById[r.film_id] = r.films
  const creatorNameById = Object.fromEntries((creatorsRes.data || []).map((u) => [u.id, u.name || null]))
  const holdersById = Object.fromEntries((holdersRes.data || []).map((u) => [u.id, u]))
  const walletsByKey = Object.fromEntries((walletsRes.data || []).map((w) => [`${w.user_id}:${w.film_id}`, w]))
  const invitesByFilm = {}
  for (const inv of invitesRes.data || []) (invitesByFilm[inv.film_id] ||= []).push(inv)
  const evaluated = evaluatePassItOnRows(list, { now, filmsById, holdersById, walletsByKey, invitesByFilm }).map((entry) => ({
    ...entry,
    hands: pathHands(entry.row, invitesByFilm[entry.row.film_id] || [], creatorNameById),
  }))
  const selected = evaluated
    .filter((x) => x.reason === null)
    .sort((a, b) => a.anchor - b.anchor)
    .slice(0, PASS_IT_ON_MAX_PER_RUN)
  return { evaluated, selected, migrated, missingColumns: OPTIONAL_COLUMNS.filter((c) => !optional.includes(c)) }
}

/** The email's path: the SAME lineage the link payload serves (server/
 *  lineage.js), first-named by the SAME rule the rail reads (chainHands). */
export function pathHands(row, filmInvites, creatorNameById = {}) {
  const creatorId = row.films?.creator_id || null
  const { lineageNames, senderIsCreator } = buildLineage({
    invite: row,
    rows: filmInvites,
    creatorId,
    creatorUserName: creatorId ? creatorNameById[creatorId] || null : null,
  })
  return chainHands(lineageNames, { senderIsCreator })
}

/** The MASKED preview of one evaluated entry — what a route or a log may show. */
export function previewEntry(entry, now = new Date()) {
  const { row, invitationsLeft, anchor, reason } = entry
  return {
    inviteId: row.id,
    filmId: row.film_id,
    filmTitle: row.films?.title || null,
    ticketNo: row.ticket_no,
    to: maskEmail(row.claimed_email),
    status: row.status,
    invitationsLeft: invitationsLeft === Infinity ? 'unlimited' : invitationsLeft,
    anchor: anchor == null ? null : new Date(anchor).toISOString(),
    daysSince: anchor == null ? null : daysBetween(new Date(anchor).toISOString(), now),
    // The path the email would show (first names only), or null below three people.
    path: entry.hands && entry.hands.length >= 2 ? railPathDescription(railPathNodes(entry.hands, [])) : null,
    ...(reason ? { excluded: reason } : {}),
  }
}

/** Exclusion reasons tallied — the dry run's "why not the others". */
export function tallyReasons(evaluated) {
  const tally = {}
  for (const e of evaluated) if (e.reason) tally[e.reason] = (tally[e.reason] || 0) + 1
  return tally
}

export { PASS_IT_ON_AFTER_DAYS, PASS_IT_ON_MAX_PER_RUN }
