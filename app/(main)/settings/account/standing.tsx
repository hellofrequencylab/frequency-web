import { explainTrust } from '@/lib/trust/explain'
import { readOwnTrustSignals } from '@/lib/trust/store'

// "Your standing" (LIVE-679, ADR-247): the member's OWN trust score and what built it, one line per
// kind of signal. Keyed to the session's profile by the caller, never to one from a request. Trust is
// reputation, never money; it orders review queues and is never shown to anyone else.

export async function YourStanding({ profileId }: { profileId: string }) {
  const { score, lines } = explainTrust(await readOwnTrustSignals(profileId))
  if (lines.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface-elevated px-4 py-6 text-body-sm text-muted">
        Nothing has counted toward your standing yet. Checking in at gatherings, verifications and
        completed sales add to it. Only you can see this.
      </p>
    )
  }
  return (
    <div className="rounded-card border border-border bg-surface lift-1" data-trust-standing>
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3">
        <span className="text-body-sm font-medium text-text">Your standing</span>
        <span className="text-stat-sm text-text tabular-nums">{score}</span>
      </div>
      <ul className="divide-y divide-border">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="min-w-0 text-body-sm text-text">
              {l.label}
              {l.count > 1 && <span className="text-muted"> ({l.count} times)</span>}
            </span>
            <span className={`shrink-0 text-body-sm font-medium tabular-nums ${l.total < 0 ? 'text-danger' : 'text-success'}`}>
              {l.total > 0 ? `+${l.total}` : l.total}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2.5 text-meta text-muted">Only you can see this.</p>
    </div>
  )
}
