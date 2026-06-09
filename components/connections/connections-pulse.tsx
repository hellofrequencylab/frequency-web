import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { getConnectionsPulse } from '@/lib/connections/pulse'
import type { NearMiss } from '@/lib/connections/resonance'
import { relativeTime } from '@/lib/utils'
import { PulseAvatar } from '@/components/connections/pulse-avatar'
import { PulseConnectButton, PulseWelcomeRow } from '@/components/connections/pulse-actions'

// "Connections this week" pulse (ADR-186, P5 + P3b) — the proactive nudge that
// turns the Community directory into an agenda. A tasteful, compact card with up
// to three reasons to reach out, each sub-section shown only when it has people.
//
// Guardrails (ADR-186): warm, human copy; never a guilt trip. The Welcome reward
// is for the act of greeting, not a ranking. Resonance numbers are never shown —
// only the orbit / "drifted" framing. Every list is the caller's own private read
// (already gated by the platform toggles in getConnectionsPulse).
export async function ConnectionsPulse() {
  const { reconnect, nearMisses, welcome, empty } = await getConnectionsPulse()
  if (empty) return null

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary-strong" />
        <h2 className="text-sm font-bold tracking-tight text-text">Worth a moment</h2>
      </div>
      <p className="mt-1 text-2xs text-subtle">A few people it might be nice to reach out to this week.</p>

      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Reconnect — friends who've drifted to your outer orbit. A warm open
            door, never a guilt trip; resonance numbers stay private. */}
        {reconnect.length > 0 && (
          <PulseGroup title="Reconnect">
            {reconnect.map((m) => (
              <div key={m.profileId} className="flex items-center gap-3">
                <PulseAvatar href={`/people/${m.handle}`} displayName={m.displayName} avatarUrl={m.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/people/${m.handle}`}
                    className="block truncate text-sm font-semibold text-text hover:text-primary-strong"
                  >
                    {m.displayName}
                  </Link>
                  <p className="truncate text-2xs text-subtle">You&rsquo;ve drifted a little</p>
                </div>
                <Link
                  href={`/people/${m.handle}`}
                  className="inline-flex shrink-0 items-center rounded-lg border border-border px-3 py-1.5 text-2xs font-medium text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  Say hi
                </Link>
              </div>
            ))}
          </PulseGroup>
        )}

        {/* Near-misses — people you keep crossing paths with but haven't met.
            Here the overlap context is fair game (it's the reason to connect). */}
        {nearMisses.length > 0 && (
          <PulseGroup title="You keep crossing paths">
            {nearMisses.map((m) => (
              <div key={m.profileId} className="flex items-center gap-3">
                <PulseAvatar href={`/people/${m.handle}`} displayName={m.displayName} avatarUrl={m.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/people/${m.handle}`}
                    className="block truncate text-sm font-semibold text-text hover:text-primary-strong"
                  >
                    {m.displayName}
                  </Link>
                  <p className="truncate text-2xs text-subtle">{nearMissLine(m)}</p>
                </div>
                <PulseConnectButton targetId={m.profileId} />
              </div>
            ))}
          </PulseGroup>
        )}

        {/* Welcome — newcomers in your circles to greet (earns gems for the act).
            Each row owns its own button so it can show the reward and self-clear. */}
        {welcome.length > 0 && (
          <PulseGroup title="Welcome someone new">
            {welcome.map((m) => (
              <PulseWelcomeRow
                key={m.profileId}
                newcomerId={m.profileId}
                handle={m.handle}
                displayName={m.displayName}
                avatarUrl={m.avatarUrl}
                line={welcomeLine(m.joinedAt, m.sharedCircles)}
              />
            ))}
          </PulseGroup>
        )}
      </div>
    </section>
  )
}

function PulseGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

/** The "why you keep crossing paths" line for a near-miss — shared circles and
 *  events together are the genuine common ground (the reason to connect). */
function nearMissLine(m: NearMiss): string {
  const bits: string[] = []
  if (m.sharedCircles > 0) bits.push(`${m.sharedCircles} shared circle${m.sharedCircles === 1 ? '' : 's'}`)
  if (m.coEvents > 0) bits.push(`${m.coEvents} event${m.coEvents === 1 ? '' : 's'} together`)
  return bits.join(' · ') || 'Your paths keep crossing'
}

/** "Just joined {relativeTime} · N shared circles" — warm, factual; the shared
 *  circles are the genuine common ground, not a score. */
function welcomeLine(joinedAt: string | null, sharedCircles: number): string {
  const bits: string[] = []
  bits.push(joinedAt ? `Just joined ${relativeTime(joinedAt)}` : 'Just joined')
  if (sharedCircles > 0) {
    bits.push(`${sharedCircles} shared circle${sharedCircles === 1 ? '' : 's'}`)
  }
  return bits.join(' · ')
}
