import { countingSinceLine } from '../lib/emailStats.js'

/**
 * The owner's email-attribution table on a creator-dashboard film card
 * (founder decision, 17 September 2026). Every number comes from
 * src/lib/emailStats.js; the headers say exactly what is counted. Renders
 * the empty line when the film has no events yet.
 */
export default function EmailStatsTable({ stats }) {
  const rows = stats?.rows || []
  const since = countingSinceLine(stats?.since)
  return (
    <div className="mb-6" data-testid="email-stats">
      <h4 className="font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">Emails</h4>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-text-muted">No automated emails counted yet.</p>
      ) : (
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-text-muted">
              <th className="py-1 pr-3 font-normal">Email</th>
              <th className="py-1 pr-3 text-right font-normal">Sent</th>
              <th className="py-1 pr-3 text-right font-normal">Arrived by this email</th>
              <th className="py-1 pr-3 text-right font-normal">Watched after arriving</th>
              <th className="py-1 text-right font-normal">Shared after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kind} className="border-t border-border">
                <td className="py-1.5 pr-3">{r.label}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.sent}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.arrived}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.watchedAfter}</td>
                <td className="py-1.5 text-right tabular-nums">{r.sharedAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {since && <p className="mt-2 text-[11px] text-text-muted/80">{since}</p>}
    </div>
  )
}
