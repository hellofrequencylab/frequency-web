// Profile STAT counts for the entity hero + the in-body Highlights module (ENTITY-SPACES-BUILD
// §A.4 / §B.3). One place computes a Space's live numbers from its OWN rows so the hero strip
// (ProfileHeroStats) and the `entity-stats` module never drift. Each read is space_id-filtered +
// fail-safe, so a brand-new Space resolves to zeros (the empties carry the page).
//
// Proof over claims (CONTENT-VOICE §6f): honest first-party counts, plain-noun labels (no "points").

import { type HeroStat } from './blueprints'
import { templateDescriptorForSpace, type TemplateResolverInput } from './templates'
import { listEventsForSpace } from '@/lib/events/store'
import { listPracticesForSpace } from '@/lib/practices'
import { listJourneyPlansForSpace } from '@/lib/journey-plans'
import { listCirclesForSpace } from '@/lib/circles/store'
import { listSpaceMembers } from './membership'

/** One resolved hero stat: the template's label + the live value from the Space's own rows. */
export interface ResolvedStat {
  metric: HeroStat['metric']
  label: string
  value: number
}

/** Compute the public-page TEMPLATE's hero stats (up to four) for a Space from its own rows (ADR-472):
 *  the ordered stat set is now driven by the resolved layout template, not the per-type blueprint, so the
 *  four templates (Book / Schedule / Storefront / Hub) show distinct, template-framed numbers. FAIL-SAFE:
 *  every underlying read degrades to 0, and the hero drops any stat that resolves to 0. The legacy
 *  `(spaceId, type)` call site keeps working: a bare `type` string resolves through the template layer
 *  with no variant/plan/preferences (the per-type fallback template), so the resolver stays total. */
export async function resolveProfileStats(
  spaceId: string,
  input: string | TemplateResolverInput,
): Promise<ResolvedStat[]> {
  const resolverInput: TemplateResolverInput =
    typeof input === 'string' ? { type: input as TemplateResolverInput['type'] } : input
  const descriptor = templateDescriptorForSpace(resolverInput)

  const [events, practices, journeys, circles, members] = await Promise.all([
    listEventsForSpace(spaceId, { limit: 200 }),
    listPracticesForSpace(spaceId, 200),
    listJourneyPlansForSpace(spaceId, 200),
    listCirclesForSpace(spaceId, 200),
    listSpaceMembers(spaceId),
  ])

  const liveEvents = events.filter((e) => !e.is_cancelled)
  const upcoming = liveEvents.filter((e) => new Date(e.starts_at).getTime() >= Date.now()).length
  const activeCircles = circles.filter((c) => c.status === 'active').length
  const activeMembers = members.filter((m) => m.status === 'active').length

  const valueFor = (metric: HeroStat['metric']): number => {
    switch (metric) {
      case 'sessions':
        return upcoming
      case 'offerings':
        return liveEvents.length
      case 'practices':
        return practices.length + journeys.length
      case 'circles':
        return activeCircles
      case 'members':
        // The lead "people" stat: active space_members (Members / Supporters / People supported,
        // labeled by the template).
        return activeMembers
      case 'clients':
        // The Book / Storefront templates frame the same active members as "Clients" (proof over
        // claims: the same honest first-party count, a client-facing label). No separate source.
        return activeMembers
      // `standing` has no honest live source yet, so it resolves to 0 and is dropped by the hero
      // (which shows only non-zero stats). Never an invented number (CONTENT-VOICE §6f).
      default:
        return 0
    }
  }

  return descriptor.hero.heroStats
    .slice(0, 4)
    .map((s) => ({ metric: s.metric, label: s.label, value: valueFor(s.metric) }))
}
