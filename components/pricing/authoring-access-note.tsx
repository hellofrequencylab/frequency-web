import { Info } from 'lucide-react'
import { betaLeadLine, contentSafetyLine } from '@/lib/core/beta-notices'

// AUTHORING ACCESS NOTE — the one place that explains WHO can build + publish a Practice or a Journey,
// what changes after the Beta, and the promise that nothing built is ever lost. Shown on every creation
// surface (the Space + personal managers, the create pages) so a member always knows the permission they
// are working under BEFORE they hit a wall.
//
// All beta-tied copy comes from lib/core/beta-notices.ts (the switch), so when BETA_OPEN_ACCESS flips at
// launch this note swaps to the live-site wording with no edit here. The permission RULE line is stated
// for the viewer's context (free vs paid owner). Voice per docs/CONTENT-VOICE: plain, warm, no em/en
// dashes, no narrated feelings, skeptic-proof.

export type AuthoringKind = 'practice' | 'journey'

/** The permission rule, stated for the viewer's context. Free owners see the upsell framing; paid owners
 *  see the "unlimited" line. Practices are abundant (draft freely, Crew to reach the public library);
 *  Journeys are the program upsell (free publishes one). */
function ruleLine(kind: AuthoringKind, paidOwner: boolean): string {
  if (kind === 'practice') {
    return 'Anyone can draft practices and make them live in this space. Listing one in the public library takes Crew, which is free to start.'
  }
  return paidOwner
    ? 'You can draft, publish, and list as many Journeys as you like.'
    : 'You can draft as many Journeys as you like. Free spaces publish one. Upgrade to publish more and list them in the library.'
}

/**
 * The access note for a Practice or Journey creation surface. `paidOwner` is whether the owner (the Space
 * plan, or the member) is on a paid tier, so the Journey line reads the right way; it defaults to false
 * (the upsell framing).
 */
export function AuthoringAccessNote({
  kind,
  paidOwner = false,
}: {
  kind: AuthoringKind
  paidOwner?: boolean
}) {
  const betaLead = betaLeadLine()
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="space-y-1.5 text-muted">
        {betaLead && <p className="font-medium text-text">{betaLead}</p>}
        <p>{ruleLine(kind, paidOwner)}</p>
        <p>{contentSafetyLine(kind)}</p>
      </div>
    </div>
  )
}
