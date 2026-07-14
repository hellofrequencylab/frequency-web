// VIEWER-RELATIVE CONTACT CARD ASSEMBLY — the named read primitive for the membrane model
// (docs/CRM-MASTER-BUILD-PLAN.md §1.1 + Phase 0/1). A CRM contact card is assembled at READ time from
// TWO planes, never one "full" object filtered on the client:
//
//   • the PERSON SPINE (global, shared)  — the canonical human, resolved by lowercased email
//     (resolvePerson / ADR-130): identity + platform membership. Safe to show any authorized viewer.
//   • the SCOPE OVERLAY (sealed, per-viewer) — only THIS viewer's slice of the timeline: their own
//     personal book, their Space, or (for staff) the whole-person view. Never another scope's rows.
//
// The invariant (the one-way membrane): resolution unifies the GRAPH, it never widens VISIBILITY. This
// helper is the single place that enforces "global identity + the viewer's own overlay" so no caller
// hand-rolls a cross-scope read. It composes the existing, already-scoped reads (resolvePerson +
// listContactInteractions / listInteractionsForPerson + buildTimeline + getContactEngagementStats) —
// each of which the individual pages already call correctly; this just gives that assembly a name and a
// guarantee, so a new surface can ask for "this person, through my lens" in one call.
//
// Server-only, service-role underneath (the crm/network tables are untyped, ADR-246). The CALLER is
// responsible for having authorized the viewer scope it passes (staff gate / Space editor gate / owner
// gate), exactly like the reads it composes; this binds the timeline read to whichever scope it is told.

import { resolvePerson, type Person } from './person'
import {
  listContactInteractions,
  listInteractionsForPerson,
  type ContactInteraction,
} from './interactions'
import { buildTimeline, type TimelineEntry } from './timeline'
import { getContactEngagementStats, type EngagementStats } from './engagement-stats'

/**
 * WHO is looking, and therefore WHICH overlay they may see:
 *   • { kind: 'owner', ownerProfileId }  — a member's own personal contact book (network_contacts).
 *   • { kind: 'space', spaceId }         — one business Space's sealed overlay (contacts in that Space).
 *   • { kind: 'staff' }                  — the platform person view: every subject row for this person
 *                                          (already staff-gated upstream), the widest authorized lens.
 * The default per surface: automated events hidden on a member's personal card, shown for staff.
 */
export type ViewerScope =
  | { kind: 'owner'; ownerProfileId: string }
  | { kind: 'space'; spaceId: string }
  | { kind: 'staff' }

/** A contact card assembled viewer-relative: the global person + only the viewer's overlay slice. */
export interface ViewerContactCard {
  /** The global person spine (identity + membership). Shared plane, safe for any authorized viewer. */
  person: Person
  /** The viewer's OWN timeline slice (never cross-scope), newest first. `includeAutomated` controls
   *  the system/human toggle default at build time; the client toggle re-filters with filterTimeline. */
  timeline: TimelineEntry[]
  /** The engagement rollup for this person (sent/opened/clicked/replied + recency), computed on read. */
  engagement: EngagementStats
}

/** Whether this viewer defaults to showing automated events (staff console yes; personal card no). */
export function defaultIncludeAutomated(scope: ViewerScope): boolean {
  return scope.kind === 'staff'
}

/**
 * Assemble a contact card for `contactId` through `viewer`'s lens. Returns null when the person cannot
 * be resolved. The timeline is read ONLY within the viewer's scope, so a Space viewer never sees the
 * platform's or another Space's rows, and an owner sees only their own book. FAIL-SAFE: identity always
 * loads if the person exists; a timeline / stats miss degrades to empty rather than throwing.
 */
export async function assembleContactCard(
  contactId: string,
  viewer: ViewerScope,
  options?: { includeAutomated?: boolean },
): Promise<ViewerContactCard | null> {
  const person = await resolvePerson(contactId)
  if (!person) return null

  const { contact, captures } = person
  // Every subject id that stitches to this person (used only for the STAFF whole-person lens).
  const subjectIds = [contact.id, contact.profileId, ...captures.map((c) => c.id)]

  let interactions: ContactInteraction[] = []
  if (viewer.kind === 'staff') {
    // Platform person view: every subject row, regardless of who logged it (already staff-gated).
    interactions = await listInteractionsForPerson(subjectIds)
  } else if (viewer.kind === 'space') {
    // One Space's sealed overlay: only rows scoped to this Space and this contact subject.
    interactions = await listContactInteractions({
      spaceId: viewer.spaceId,
      subjectKind: 'contact',
      subjectId: contact.id,
    })
  } else {
    // A member's own personal book: only rows this owner logged against their capture of this person.
    const ownerSubjectIds = captures.length ? captures.map((c) => c.id) : [contact.id]
    const slices = await Promise.all(
      ownerSubjectIds.map((sid) =>
        listContactInteractions({
          ownerProfileId: viewer.ownerProfileId,
          subjectKind: 'network_contact',
          subjectId: sid,
        }),
      ),
    )
    interactions = slices.flat()
  }

  const includeAutomated = options?.includeAutomated ?? defaultIncludeAutomated(viewer)
  const timeline = buildTimeline({ interactions }, 200, { includeAutomated })

  // Engagement is a whole-person rollup off the immutable log + email events (staff lens); scoped
  // viewers get the slice they can see. The email union always uses the person's canonical email.
  const engagement = await getContactEngagementStats(
    viewer.kind === 'staff' ? subjectIds : interactions.map((i) => i.subjectId),
    contact.email,
  )

  return { person, timeline, engagement }
}
