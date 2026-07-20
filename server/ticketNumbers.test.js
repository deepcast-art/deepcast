import { describe, it, expect, vi } from 'vitest'
import { nextTicketNo } from './ticketNumbers.js'

const supabaseWith = (rpc) => ({ rpc })

describe('nextTicketNo', () => {
  it('returns the number from a scalar rpc result', async () => {
    const sb = supabaseWith(vi.fn().mockResolvedValue({ data: 7, error: null }))
    expect(await nextTicketNo(sb, 'film-1')).toBe(7)
    expect(sb.rpc).toHaveBeenCalledWith('next_ticket_no', { p_film_id: 'film-1' })
  })

  it('unwraps a single-element array result', async () => {
    const sb = supabaseWith(vi.fn().mockResolvedValue({ data: [42], error: null }))
    expect(await nextTicketNo(sb, 'film-1')).toBe(42)
  })

  it('is NEVER fatal: rpc error → null, no throw', async () => {
    const sb = supabaseWith(vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }))
    expect(await nextTicketNo(sb, 'film-1')).toBeNull()
  })

  it('is NEVER fatal: rejected rpc → null, no throw', async () => {
    const sb = supabaseWith(vi.fn().mockRejectedValue(new Error('network')))
    expect(await nextTicketNo(sb, 'film-1')).toBeNull()
  })

  it('rejects nonsense values (0, negatives, non-numbers)', async () => {
    for (const bad of [0, -3, 'x', null, undefined, 1.5]) {
      const sb = supabaseWith(vi.fn().mockResolvedValue({ data: bad, error: null }))
      expect(await nextTicketNo(sb, 'film-1')).toBeNull()
    }
  })
})
