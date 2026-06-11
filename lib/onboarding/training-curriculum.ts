// Role-advancement training curriculum (ADR-224, build §7.3–7.5). The PURE,
// dependency-free spine of role-advancement training: the per-tier curriculum
// registry, the promotion→curriculum selector, and the helper that derives a
// curriculum from `role`-tagged help articles. No Supabase / Next imports, so it
// runs under Node's TS type-stripping and is fully unit-tested. The DB layer
// (training.ts) and the authoring surface both build on this.
//
// One curriculum per COMMUNITY-TRUST rung gained (member < crew < host < guide <
// mentor). A promotion teaches the functions the new rung just unlocked, as a
// curated path through the help center. Registry-defined today; the authoring
// surface (7.5) reads this registry, and `role`-tagged help articles feed it.

import type { CommunityRole } from '@/lib/core/roles'

export interface TrainingStep {
  label: string
  href: string
}

export interface TrainingDef {
  role: CommunityRole
  title: string
  blurb: string
  steps: TrainingStep[]
  /** Gems paid once on completion (online training → gems, ADR-139). */
  reward: number
}

// The COMMUNITY-TRUST rungs that carry an advancement curriculum, in ascending
// order. 'member' is the entry rung (its induction is the activation funnel, not a
// training Journey), and 'crew' is the first earned step. The staff rungs
// ('admin'/'janitor') are a separate axis (ADR-208) and carry no community
// curriculum. Keep this in step with ROLE_HIERARCHY.
export const TRAINING_TIERS: readonly CommunityRole[] = ['crew', 'host', 'guide', 'mentor'] as const

// The curriculum registry. Behavior-preserving for the two tiers that shipped with
// §7.2 (crew, host); 7.3–7.5 add the guide and mentor rungs so every promotion up
// the ladder has a path. Steps point at help articles — the same content the
// `role` front-matter tag associates (see helpCurriculumSteps below).
export const TRAINING: Partial<Record<CommunityRole, TrainingDef>> = {
  crew: {
    role: 'crew',
    title: 'Welcome to Crew',
    blurb: 'You’re in. Here’s how to get the most out of the community: find your circles and start a practice.',
    steps: [
      { label: 'Join a local circle', href: '/help/getting-started/join-a-circle' },
      { label: 'Adopt a practice', href: '/help/getting-started/practices' },
      { label: 'Follow a Journey', href: '/help/the-game/your-journey' },
      { label: 'Earn zaps & gems', href: '/help/the-game/zaps-and-gems' },
    ],
    reward: 15,
  },
  host: {
    role: 'host',
    title: 'Host Training',
    blurb: 'You can host now. This walks you through running a circle and the admin tools you just unlocked.',
    steps: [
      { label: 'Run events', href: '/help/groups/events' },
      { label: 'Use channels', href: '/help/groups/channels' },
      { label: 'Send a broadcast', href: '/help/sharing/broadcasts' },
      { label: 'Hubs & scope', href: '/help/groups/hubs' },
    ],
    reward: 25,
  },
  guide: {
    role: 'guide',
    title: 'Guide Training',
    blurb: 'You guide a hub now — a family of circles. This covers stewarding hosts, shaping the hub, and the wider tools you just unlocked.',
    steps: [
      { label: 'Steward a hub', href: '/help/groups/hubs' },
      { label: 'Support your hosts', href: '/help/groups/events' },
      { label: 'Curate channels across circles', href: '/help/groups/channels' },
      { label: 'Broadcast to the hub', href: '/help/sharing/broadcasts' },
    ],
    reward: 40,
  },
  mentor: {
    role: 'mentor',
    title: 'Mentor Training',
    blurb: 'You mentor a nexus — a region of hubs. This is the widest stewardship: growing guides, holding the standard, and the regional tools you just unlocked.',
    steps: [
      { label: 'Hold a nexus', href: '/help/groups/hubs' },
      { label: 'Grow and back your guides', href: '/help/groups/events' },
      { label: 'Set the regional rhythm', href: '/help/sharing/broadcasts' },
      { label: 'Keep the standard', href: '/help/safety/reporting' },
    ],
    reward: 60,
  },
}

/**
 * Which advancement curriculum a member should be assigned when promoted INTO
 * `role`. Returns the curriculum for that rung, or null when the rung carries no
 * curriculum (e.g. 'member', or the staff rungs). Pure selector — the single
 * source for "which Journey for which promotion".
 */
export function curriculumForPromotion(role: CommunityRole): TrainingDef | null {
  return TRAINING[role] ?? null
}

/** Does a promotion into `role` assign a training Journey? */
export function hasCurriculum(role: CommunityRole): boolean {
  return curriculumForPromotion(role) !== null
}

// ── Help-tag-driven curriculum ────────────────────────────────────────────────
//
// A help article can carry a `role` front-matter tag (lib/help/content.ts). Those
// tagged articles ARE the curriculum source: tag the host articles `role: host`
// and they become the host path's steps. This lets curriculum authoring happen in
// the help content (where the words already live) rather than duplicating links in
// a registry. The registry above stays as the curated default + ordering/reward;
// helpCurriculumSteps derives steps from tags when you'd rather drive it that way.

/** Minimal shape we need from a help article — keeps this module free of the help
 *  loader's fs dependency so it stays pure + unit-testable. */
export interface RoleTaggedArticle {
  category: string
  slug: string
  title: string
  order: number
  role?: string
  status?: string
}

export function helpHref(category: string, slug: string): string {
  return `/help/${category}/${slug}`
}

/**
 * Build curriculum steps from the help articles tagged for `role`. Published
 * articles only, sorted by the article `order` then title for a stable path. Pure:
 * the caller supplies the articles (from the help loader). Untagged articles are
 * never included, so this is behavior-preserving for the existing help center.
 */
export function helpCurriculumSteps(
  articles: readonly RoleTaggedArticle[],
  role: CommunityRole,
): TrainingStep[] {
  return articles
    .filter((a) => a.role === role && (a.status ?? 'published') === 'published')
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((a) => ({ label: a.title, href: helpHref(a.category, a.slug) }))
}

/**
 * The authoring/preview view of a tier: the registry curriculum for the rung,
 * plus the help articles currently `role`-tagged for it (the editable source). The
 * authoring surface renders this; `taggedSteps` shows what a tag-driven curriculum
 * WOULD produce, so an author can see registry vs. tags side by side.
 */
export interface TierCurriculumView {
  role: CommunityRole
  def: TrainingDef | null
  taggedSteps: TrainingStep[]
}

export function tierCurriculumViews(
  articles: readonly RoleTaggedArticle[],
): TierCurriculumView[] {
  return TRAINING_TIERS.map((role) => ({
    role,
    def: curriculumForPromotion(role),
    taggedSteps: helpCurriculumSteps(articles, role),
  }))
}
