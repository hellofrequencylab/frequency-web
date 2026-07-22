// SHARED COLLABORATOR CALENDAR (ADR-799 B3, first slice). The combined upcoming calendar of a Space PLUS
// its ACCEPTED collaborators, so a steward sees every partner's happenings in one place to coordinate.
//
// THE LEAK CONTRACT: each source (this space + each accepted collaborator) is read through the SAME
// public/published gate as the per-space calendar tab (listSpaceCalendarEvents, which only returns
// published, public/unlisted, non-cancelled events). So a collaborator's PRIVATE/draft/circle_only event
// NEVER appears here — this only UNIONS events that are already public on each partner's own calendar. An
// accepted collaboration is the gate for WHICH spaces contribute; it never widens WHICH events show. Pure
// composition over the existing gated reads; FAIL-SAFE (a failing source contributes nothing).

import { listAcceptedCollaborations } from './collaborations'
import { listSpaceCalendarEvents, type SpaceCalendarEvent } from '@/lib/events/store'

/** A calendar event tagged with the space it belongs to (this space or an accepted collaborator). */
export interface SharedCalendarEvent extends SpaceCalendarEvent {
  /** The name of the space this event belongs to. */
  sourceName: string
  /** True when the event is this space's own (vs. a collaborator's). */
  isOwn: boolean
}

/** PURE: the distinct source spaces (this space first, then each accepted collaborator once) whose public
 *  calendars combine into the shared view. Dedupes by id, keeping the first (own) name for a collision. */
export function collaboratorCalendarSources(
  spaceId: string,
  ownName: string,
  partners: readonly { partner: { id: string; name: string } }[],
): { id: string; name: string; isOwn: boolean }[] {
  const sources = [
    { id: spaceId, name: ownName, isOwn: true },
    ...partners.map((p) => ({ id: p.partner.id, name: p.partner.name, isOwn: false })),
  ]
  const seen = new Set<string>()
  return sources.filter((s) => (s.id && !seen.has(s.id) ? (seen.add(s.id), true) : false))
}

/** The merged upcoming events of a space + its accepted collaborators, each tagged with its source. Every
 *  source goes through the public/published gate (listSpaceCalendarEvents), so nothing private leaks.
 *  FAIL-SAFE throughout. Returns [] when there are no accepted collaborators (the caller then hides the
 *  section — the shared view only earns its place once there is a partner to share with). */
export async function listSharedCollaboratorEvents(
  spaceId: string,
  ownName: string,
  opts: { fromDay?: string; limit?: number } = {},
): Promise<SharedCalendarEvent[]> {
  const partners = await listAcceptedCollaborations(spaceId)
  if (partners.length === 0) return []
  const sources = collaboratorCalendarSources(spaceId, ownName, partners)
  const perSource = await Promise.all(
    sources.map(async (s) => {
      const evs = await listSpaceCalendarEvents(s.id, opts)
      return evs.map((e): SharedCalendarEvent => ({ ...e, sourceName: s.name, isOwn: s.isOwn }))
    }),
  )
  return perSource.flat()
}
