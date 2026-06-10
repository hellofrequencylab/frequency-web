import { Sparkles, MapPin, Globe, CalendarDays, Users, Clock, MessageSquare } from 'lucide-react'
import { startConversation } from '@/app/(main)/messages/actions'
import { getMyOrbit, ORBIT_LABEL, resonanceContext, type OrbitMember } from '@/lib/connections/resonance'
import { getConnectionSettings } from '@/lib/connections/connection-settings'
import { relativeTime } from '@/lib/utils'
import { RelationshipTimeline } from './relationship-timeline'

// ── "How you're connected" (Connection Layer P2, ADR-186) ─────────────────────
// The viewer's *private* read of their own tie to this member — the shared history
// made legible, framed as a memory and never a scoreboard. Resonance/orbit is the
// caller's read of their OWN relationship and is never shown to anyone else about
// someone else's tie (the panel only ever runs for the signed-in viewer).
//
// Renders nothing for the owner viewing themselves and nothing for logged-out
// viewers (both are gated by the caller passing isOwner / a viewer profile id).

/** "Jun 2026" — the month/year a tie was formed. */
function metMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const HOW_MET_LABEL: Record<OrbitMember['howMet'], string> = {
  in_person: 'Met in person',
  online: 'Met online',
  unknown: 'Connected',
}

export async function ConnectionPanel({
  profileId,
  firstName,
  friendAction,
}: {
  /** The viewed profile's id. The panel is only rendered for a signed-in non-owner. */
  profileId: string
  firstName: string
  /** The existing Connect / Add-friend control from the profile page (reused, not reinvented). */
  friendAction?: React.ReactNode
}) {
  const [orbit, settings] = await Promise.all([getMyOrbit(), getConnectionSettings()])
  const tie = orbit.find((m) => m.profileId === profileId)

  // Connected + resonance surfaced (admin-gated). The warm, full read.
  if (tie && settings.resonanceEnabled) {
    const HowMetIcon = tie.howMet === 'online' ? Globe : MapPin
    const context = resonanceContext(tie)
    const drifted = tie.orbit === 'outer'

    return (
      <section className="mb-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-text">
            <Sparkles className="h-4 w-4 text-primary" /> How you’re connected
          </p>
          <span className="rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
            {ORBIT_LABEL[tie.orbit]}
          </span>
        </div>

        <dl className="space-y-2 text-xs">
          {tie.metAt && (
            <div className="flex items-center gap-2 text-muted">
              <HowMetIcon className="h-3.5 w-3.5 shrink-0 text-subtle" />
              <span>
                {HOW_MET_LABEL[tie.howMet]} · <span className="font-medium text-text">{metMonth(tie.metAt)}</span>
              </span>
            </div>
          )}

          {context && (
            <div className="flex items-center gap-2 text-muted">
              <Users className="h-3.5 w-3.5 shrink-0 text-subtle" />
              <span>{context}</span>
            </div>
          )}

          {tie.lastTogether && (
            <div className="flex items-center gap-2 text-muted">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-subtle" />
              <span>
                Last together <span className="font-medium text-text">{relativeTime(tie.lastTogether)}</span>
              </span>
            </div>
          )}
        </dl>

        <div className="mt-3 border-t border-border pt-3">
          <RelationshipTimeline otherId={profileId} />
        </div>

        {drifted && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-2xs text-subtle">
              <Clock className="h-3.5 w-3.5" /> It’s been a while. Say hi?
            </p>
            <form action={startConversation.bind(null, profileId)}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Reconnect with {firstName}
              </button>
            </form>
          </div>
        )}
      </section>
    )
  }

  // Connected but resonance gated off platform-wide → keep it lean: a quiet orbit
  // note only if there's neutral shared context, else nothing.
  if (tie) {
    const context = resonanceContext(tie)
    if (!context) return null
    return (
      <section className="mb-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
          <Sparkles className="h-4 w-4 text-primary" /> How you’re connected
        </p>
        <p className="flex items-center gap-2 text-xs text-muted">
          <Users className="h-3.5 w-3.5 shrink-0 text-subtle" /> {context}
        </p>
      </section>
    )
  }

  // Not connected. Show neutral shared context if it's cheaply available from a
  // near-miss style overlap (shared circles), plus the existing Connect control.
  // No resonance score is ever surfaced for a non-connection (ADR-186).
  if (!friendAction) return null

  return (
    <section className="mb-6 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text">
        <Sparkles className="h-4 w-4 text-primary" /> Connect with {firstName}
      </p>
      <p className="mb-3 text-xs text-muted">
        You’re not connected yet. Add {firstName} to start building your shared history.
      </p>
      <div className="[&_button]:w-full [&_button]:justify-center">{friendAction}</div>
    </section>
  )
}
