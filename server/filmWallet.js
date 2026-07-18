/**
 * Per-film ticket wallet (Piece F, 2026-07-17).
 *
 * One row per (person, film) in film_tickets: {balance, unlimited}. Rows are
 * LAZY — a missing row always reads as the virtual default {balance 5,
 * unlimited false} (the same NULL-heals-to-full-grant rule the invite wallet
 * has always had, via ticketSpendDecision); the first WRITE materializes it.
 *
 * All writes are service-role only (the table has no client write policies).
 * Spends are race-safe: insert-if-absent at (5 − 1), else CAS on the read
 * balance with retries — two concurrent spends can never share a ticket.
 */
import { ticketSpendDecision } from '../src/lib/ticketRules.js'

export const VIRTUAL_WALLET = Object.freeze({ balance: 5, unlimited: false })

/** The wallet row, or null when it has never been materialized. */
export async function readFilmWallet(supabase, userId, filmId) {
  if (!userId || !filmId) return null
  const { data } = await supabase
    .from('film_tickets')
    .select('user_id, film_id, balance, unlimited')
    .eq('user_id', userId)
    .eq('film_id', filmId)
    .maybeSingle()
  return data ?? null
}

/** Claim-time init: materialize at the default. NEVER resets an existing row. */
export async function initFilmWallet(supabase, userId, filmId) {
  const { error } = await supabase
    .from('film_tickets')
    .upsert(
      { user_id: userId, film_id: filmId },
      { onConflict: 'user_id,film_id', ignoreDuplicates: true }
    )
  if (error) throw new Error(`film wallet init failed: ${error.message}`)
}

/**
 * Spend one ticket from (user, film). Returns {ok:true, next} or
 * {ok:false, reason} (the founder's no-tickets line via ticketSpendDecision).
 */
export async function spendFilmTicket(supabase, userId, filmId) {
  // Missing row: materialize directly at 4 (5 − this spend). ignoreDuplicates
  // makes the race benign — the loser falls through to the CAS path.
  const { data: inserted, error: insErr } = await supabase
    .from('film_tickets')
    .upsert(
      { user_id: userId, film_id: filmId, balance: VIRTUAL_WALLET.balance - 1 },
      { onConflict: 'user_id,film_id', ignoreDuplicates: true }
    )
    .select('balance')
  if (insErr) throw new Error(`film wallet spend failed: ${insErr.message}`)
  if (inserted?.length) return { ok: true, next: inserted[0].balance }

  for (let attempt = 0; attempt < 3; attempt++) {
    const wallet = await readFilmWallet(supabase, userId, filmId)
    const decision = ticketSpendDecision(wallet?.balance)
    if (!decision.ok) return decision
    const { data: updated, error } = await supabase
      .from('film_tickets')
      .update({ balance: decision.next })
      .eq('user_id', userId)
      .eq('film_id', filmId)
      .eq('balance', wallet?.balance ?? VIRTUAL_WALLET.balance)
      .select('balance')
      .maybeSingle()
    if (error) throw new Error(`film wallet spend failed: ${error.message}`)
    if (updated) return { ok: true, next: updated.balance }
  }
  return { ok: false, reason: 'Please try again — your tickets were updating.' }
}

/** Best-effort refund (+1) — a failed generation is not a spent ticket. */
export async function refundFilmTicket(supabase, userId, filmId) {
  const wallet = await readFilmWallet(supabase, userId, filmId)
  if (!wallet) return
  await supabase
    .from('film_tickets')
    .update({ balance: wallet.balance + 1 })
    .eq('user_id', userId)
    .eq('film_id', filmId)
}

/** Admin grant: +N onto (user, film); a missing row materializes at 5 + N. */
export async function grantFilmTickets(supabase, userId, filmId, amount) {
  const { data: inserted, error: insErr } = await supabase
    .from('film_tickets')
    .upsert(
      { user_id: userId, film_id: filmId, balance: VIRTUAL_WALLET.balance + amount },
      { onConflict: 'user_id,film_id', ignoreDuplicates: true }
    )
    .select('balance')
  if (insErr) throw new Error(`film wallet grant failed: ${insErr.message}`)
  if (inserted?.length) return inserted[0].balance

  for (let attempt = 0; attempt < 3; attempt++) {
    const wallet = await readFilmWallet(supabase, userId, filmId)
    const current = Math.max(0, wallet?.balance ?? VIRTUAL_WALLET.balance)
    const { data: updated, error } = await supabase
      .from('film_tickets')
      .update({ balance: current + amount })
      .eq('user_id', userId)
      .eq('film_id', filmId)
      .eq('balance', wallet?.balance ?? VIRTUAL_WALLET.balance)
      .select('balance')
      .maybeSingle()
    if (error) throw new Error(`film wallet grant failed: ${error.message}`)
    if (updated) return updated.balance
  }
  throw new Error('film wallet grant did not land after retries')
}

/** Per-film unlimited flag (the admin toggle). Balance is never touched. */
export async function setFilmUnlimited(supabase, userId, filmId, unlimited) {
  const { data: inserted, error: insErr } = await supabase
    .from('film_tickets')
    .upsert(
      { user_id: userId, film_id: filmId, unlimited },
      { onConflict: 'user_id,film_id', ignoreDuplicates: true }
    )
    .select('unlimited')
  if (insErr) throw new Error(`film unlimited set failed: ${insErr.message}`)
  if (inserted?.length) return
  const { error } = await supabase
    .from('film_tickets')
    .update({ unlimited })
    .eq('user_id', userId)
    .eq('film_id', filmId)
  if (error) throw new Error(`film unlimited set failed: ${error.message}`)
}
