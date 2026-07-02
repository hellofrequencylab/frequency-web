// Starter Circles — shared types + the standard edit-mode guidance library.
//
// A Starter Circle is a staff-authored blueprint (table `circle_templates`) a
// would-be leader adopts ("Make it yours") into a private draft they own, then
// publishes as a completely original live Circle. Pillars are NOT how Circles
// are sorted: each leans ONE primary Pillar and carries the other three inside
// it. This module is framework-free (types + constants only) so server actions,
// the admin authoring surface, and the member builder all share one definition.

import type { PillarSlug } from '@/lib/pillars'

/** One concrete line per Pillar — what this Circle touches inside itself. The
 *  primary Pillar (the lean) is the template's `primary_pillar`, not repeated here. */
export type PillarsInside = Partial<Record<PillarSlug, string>>

/** A standing rhythm beat. `text` is the verbatim descriptor; `length` (Meetup
 *  only) is the soft time box. The Weekend Gathering carries `text` only. */
export interface CircleRhythm {
  text: string
  length?: string
}

/** An edit-mode-only instruction box. `anchor` ties it to a builder section so
 *  the editor can render it in place; it never renders on a published Circle. */
export interface CircleCallout {
  anchor: CalloutAnchor
  title: string
  body: string
}

export type CalloutAnchor =
  | 'identity'
  | 'card'
  | 'pillars'
  | 'rhythm'
  | 'meetup'
  | 'gathering'
  | 'agreements'
  | 'size'
  | 'remix'
  | 'launch'

/** A row of `circle_templates` — the blueprint catalog. */
export interface CircleTemplate {
  id: string
  slug: string
  name: string
  primaryPillar: PillarSlug
  identity: string
  audience: string
  card: string
  oneLiner: string
  about: string | null
  pillarsInside: PillarsInside
  meetup: CircleRhythm
  gathering: CircleRhythm
  thread: string | null
  format: string | null
  sizeLabel: string | null
  agreements: string[]
  /** The Pillar Journey this Circle runs as a Run; null = any (Expression). */
  recommendedJourneyPillar: PillarSlug | null
  remixOptions: string[]
  callouts: CircleCallout[]
  imageUrl: string | null
  isActive: boolean
  displayOrder: number
}

/** Global master switch key (platform_flags) gating the whole member surface. */
export const CIRCLE_TEMPLATES_FLAG = 'circle_templates_enabled' as const

// ── Standard guidance ────────────────────────────────────────────────
// The baked-in best-practice instruction boxes shown in EVERY Circle builder
// (edit mode only). A template may attach its own extra callouts on top. Voice:
// plain sentences, proper nouns carry the magic, no em dashes, skeptic test.
export const STANDARD_CALLOUTS: readonly CircleCallout[] = [
  {
    anchor: 'identity',
    title: 'Name it for the people, not the topic',
    body: 'A Circle is who shows up, not what you do. "The Reading Room" beats "Weekly Book Discussion Group." Pick a name a stranger would repeat.',
  },
  {
    anchor: 'card',
    title: 'Write the Card for the skeptic',
    body: 'Under a dozen words: name the ache, name the fix. Read it to someone who says "that is not my thing." If they still nod, it is right.',
  },
  {
    anchor: 'pillars',
    title: 'Lean one Pillar, carry all four',
    body: 'Pick the Pillar this Circle is really about, then write one honest line each for Mind, Body, Spirit, and Expression. Every Circle works the whole person.',
  },
  {
    anchor: 'rhythm',
    title: 'Two beats and a Thread',
    body: 'A midweek Circle Meetup to get known, a Weekend Gathering to do the thing, the Thread running all week. Keep the first Meetup under 90 minutes.',
  },
  {
    anchor: 'meetup',
    title: 'Always name a virtual path',
    body: 'In person is the default and the point. But distance and busy weeks kill a Circle with no fallback. Give people a way to stay in when they cannot make it.',
  },
  {
    anchor: 'agreements',
    title: 'State the norms once, plainly',
    body: 'Three or four is plenty. "What is said here stays here" does more work than a page of rules. Say them out loud at the first Meetup.',
  },
  {
    anchor: 'size',
    title: 'Small enough to be known',
    body: 'Five to twelve is the sweet spot for most Circles. If trust is the point, cap it smaller. People stay when they are missed when they are gone.',
  },
  {
    anchor: 'remix',
    title: 'Make it yours',
    body: 'This started as a template. Change the topic, the cadence, the vibe. The best version is the one you will actually run, not the one on the page.',
  },
  {
    anchor: 'launch',
    title: 'Start before it is perfect',
    body: 'Pick a date, invite eight people, run the first Meetup. A Circle becomes real by meeting, not by planning. You can fix everything else after week one.',
  },
] as const

/** Standard callouts for one builder section. */
export function standardCalloutsFor(anchor: CalloutAnchor): CircleCallout[] {
  return STANDARD_CALLOUTS.filter((c) => c.anchor === anchor)
}
