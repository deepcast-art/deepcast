/**
 * Per-film sequential ticket numbers (dashboard redesign, 2026-07-20).
 *
 * Numbers count links GENERATED, assigned atomically by the Postgres
 * function next_ticket_no (UPDATE … RETURNING row-locks the film row, so
 * concurrent generations can never share a number).
 *
 * NUMBERING IS NEVER FATAL: a link must still be created even if the
 * numbering call fails — the row keeps ticket_no NULL (the UI simply shows
 * no number) and the backfill script can number it later.
 */
export async function nextTicketNo(supabase, filmId) {
  try {
    const { data, error } = await supabase.rpc('next_ticket_no', { p_film_id: filmId })
    if (error) throw error
    // PostgREST may return the scalar directly or as a single-element array.
    const n = Number(Array.isArray(data) ? data[0] : data)
    return Number.isInteger(n) && n > 0 ? n : null
  } catch (err) {
    console.error('[ticket-no] numbering failed (link still created):', err?.message || err)
    return null
  }
}
