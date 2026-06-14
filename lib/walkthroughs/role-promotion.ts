// Role-promotion tours (build step P1.8) — the code-shipped guided walks a member
// gets when their community trust role advances (member → Host → Guide → Mentor).
// Each tour is a short slide sequence pointing at the surfaces the new role just
// unlocked, so the copy is ACCURATE: the unlocked-surface list is derived from the
// access matrix (lib/core/access-matrix.ts), not invented.
//
// WHY CODE, NOT THE DB EDITOR: the operator-authored `walkthrough` table (lib/walkthroughs.ts)
// already supports role_host/role_guide/role_mentor triggers as a PULL-BASED feed card.
// These tours are the shipped, always-on counterpart: they fire the MOMENT a role is
// granted (assignRole marks the matching tour pending) and don't depend on an operator
// having authored a row. They reuse the exact same WalkthroughStep shape + lightbox
// renderer + per-member progress store (profiles.meta.walkthroughs[slug]) — so there's
// one render path, one progress shape, no migration.
//
// Pure module (no Next/Supabase/React) so the selection logic is unit-testable. The
// surfacing component (components/walkthroughs/feed-role-promotion.tsx) and the trigger
// (assignRole) consume it.

import type { Walkthrough, WalkthroughStep } from '@/lib/walkthroughs'
import { ROLE_HIERARCHY, roleRank, type CommunityRole } from '@/lib/core/roles'

// The advancement steps we ship a tour for. The 'crew' rung is a deprecated no-op
// (lib/core/roles), so the ladder a member actually climbs is member → host → guide →
// mentor. We ship one tour per non-trivial step up that ladder.
export type PromotionStep = 'host' | 'guide' | 'mentor'

/** The slug each promotion tour stores its per-member progress under (the key in
 *  profiles.meta.walkthroughs[slug]). Stable, lowercase-alphanumeric-with-hyphens so
 *  it passes the progress writer's SAFE_SLUG allowlist. */
export const ROLE_PROMOTION_SLUG: Record<PromotionStep, string> = {
  host: 'role-promotion-host',
  guide: 'role-promotion-guide',
  mentor: 'role-promotion-mentor',
}

/** Reverse lookup: progress slug → the role it celebrates. */
export const SLUG_TO_PROMOTION_STEP: Record<string, PromotionStep> = Object.fromEntries(
  (Object.entries(ROLE_PROMOTION_SLUG) as [PromotionStep, string][]).map(([step, slug]) => [slug, step]),
)

/** Every role-promotion slug — the set the feed surfacing + progress reads gate on. */
export const ROLE_PROMOTION_SLUGS: readonly string[] = Object.values(ROLE_PROMOTION_SLUG)

// ── Tour content ─────────────────────────────────────────────────────────────────
// Voice: warm, plain, a camp counselor you respect (docs/CONTENT-VOICE.md). No em
// dashes. Never narrate the reader's feelings. Proper nouns (Lead, Insight, Vera,
// Circles, Nexus) carry the magic. Each slide reuses the WalkthroughStep shape so the
// shared <WalkthroughSlide> renders it with token-only accents.

function mkStep(s: Omit<WalkthroughStep, 'id'> & { id: string }): WalkthroughStep {
  return s
}

// Slides are intentionally ANCHORLESS lightbox slides (not DOM-spotlight steps): they
// render in the proven WalkthroughLightbox, which works on every viewport without
// depending on a nav item being painted. The surfaces each tour highlights are the ones
// the access matrix newly grants that rung: Lead (lib/core/access-matrix `lead` is
// 'full' only at host/guide/mentor), plus Insight + Vera (`insight`/`veraAi`: host
// 'limited', guide/mentor 'full'). Each gets one slide whose CTA links straight to it.
const HOST_TOUR: WalkthroughStep[] = [
  mkStep({
    id: 'host-welcome',
    title: "You're a Host now",
    accent: 'rank-teal',
    layout: 'centered',
    icon: 'Sparkles',
    body: "A Host runs a Circle and looks after the people in it. Here's a quick look at what just opened up for you.",
  }),
  mkStep({
    id: 'host-lead',
    title: 'Meet Lead',
    accent: 'rank-teal',
    layout: 'centered',
    icon: 'Compass',
    body: 'Lead is your leader home. Your Circles, the people in them, and the tools to keep things humming all live here.',
    ctaLabel: 'Open Lead',
    ctaHref: '/lead',
  }),
  mkStep({
    id: 'host-insight',
    title: 'A read on your Circle',
    accent: 'rank-teal',
    layout: 'centered',
    icon: 'Star',
    body: 'Insight gives you a simple picture of how your Circle is doing: who is showing up, what is landing, where to nudge.',
    ctaLabel: 'See Insight',
    ctaHref: '/lead',
  }),
  mkStep({
    id: 'host-vera',
    title: 'Vera has your back',
    accent: 'rank-teal',
    layout: 'centered',
    icon: 'Heart',
    body: 'Stuck on what to post or how to welcome someone new? Ask Vera. She helps you lead without the busywork.',
    ctaLabel: 'Ask Vera',
    ctaHref: '/feed?welcome=vera&v=chat',
  }),
]

const GUIDE_TOUR: WalkthroughStep[] = [
  mkStep({
    id: 'guide-welcome',
    title: "You're a Guide now",
    accent: 'rank-jade',
    layout: 'centered',
    icon: 'Sparkles',
    body: 'A Guide looks after the Hosts in a Hub. You hold a wider view now, so here is what changed.',
  }),
  mkStep({
    id: 'guide-lead',
    title: 'Lead goes wider',
    accent: 'rank-jade',
    layout: 'centered',
    icon: 'Compass',
    body: 'Lead now spans your whole Hub: every Circle under you and the Hosts running them, in one place.',
    ctaLabel: 'Open Lead',
    ctaHref: '/lead',
  }),
  mkStep({
    id: 'guide-insight',
    title: 'The full picture',
    accent: 'rank-jade',
    layout: 'centered',
    icon: 'Star',
    body: 'Insight opens up the deeper read across your Hub, so you can spot which Circles are thriving and which Hosts could use a hand.',
    ctaLabel: 'See Insight',
    ctaHref: '/lead',
  }),
  mkStep({
    id: 'guide-vera',
    title: 'Vera, the full version',
    accent: 'rank-jade',
    layout: 'centered',
    icon: 'Heart',
    body: 'Vera now helps with the bigger asks: drafting a message to your Hosts, planning a season, talking through a tricky moment.',
    ctaLabel: 'Ask Vera',
    ctaHref: '/feed?welcome=vera&v=chat',
  }),
]

const MENTOR_TOUR: WalkthroughStep[] = [
  mkStep({
    id: 'mentor-welcome',
    title: "You're a Mentor now",
    accent: 'rank-plum',
    layout: 'centered',
    icon: 'Sparkles',
    body: 'A Mentor looks after the Guides across a Nexus. This is the widest view on the trust ladder, so here is what it brings.',
  }),
  mkStep({
    id: 'mentor-lead',
    title: 'Lead across the Nexus',
    accent: 'rank-plum',
    layout: 'centered',
    icon: 'Compass',
    body: 'Lead now reaches your whole Nexus: every Hub, every Guide, every Circle underneath. Your command center for the region.',
    ctaLabel: 'Open Lead',
    ctaHref: '/lead',
  }),
  mkStep({
    id: 'mentor-insight',
    title: 'Read the whole region',
    accent: 'rank-plum',
    layout: 'centered',
    icon: 'Star',
    body: 'Insight gives you the regional read: where momentum is building, which Hubs need attention, who is ready to grow.',
    ctaLabel: 'See Insight',
    ctaHref: '/lead',
  }),
  mkStep({
    id: 'mentor-vera',
    title: 'Vera for the long game',
    accent: 'rank-plum',
    layout: 'centered',
    icon: 'Heart',
    body: 'Lean on Vera for the work that takes the region forward: coaching your Guides, shaping a season, thinking through the next move.',
    ctaLabel: 'Ask Vera',
    ctaHref: '/feed?welcome=vera&v=chat',
  }),
]

const TOUR_STEPS: Record<PromotionStep, WalkthroughStep[]> = {
  host: HOST_TOUR,
  guide: GUIDE_TOUR,
  mentor: MENTOR_TOUR,
}

const TOUR_META: Record<PromotionStep, { name: string; description: string }> = {
  host: {
    name: 'Welcome to leading',
    description: "You're a Host now. A quick tour of the tools that just opened up.",
  },
  guide: {
    name: 'Stepping up to Guide',
    description: "You're a Guide now. Here's what a wider view brings.",
  },
  mentor: {
    name: 'Stepping up to Mentor',
    description: "You're a Mentor now. A look at the region-wide view.",
  },
}

/** Build the full Walkthrough object for a promotion step, shaped exactly like a DB
 *  walkthrough so the existing card + lightbox + progress writers all just work. */
export function rolePromotionWalkthrough(step: PromotionStep): Walkthrough {
  const meta = TOUR_META[step]
  return {
    id: `role-promotion-${step}`,
    slug: ROLE_PROMOTION_SLUG[step],
    name: meta.name,
    description: meta.description,
    trigger: step === 'host' ? 'role_host' : step === 'guide' ? 'role_guide' : 'role_mentor',
    audience: null,
    active: true,
    cadence: 'until_done',
    priority: 100, // a promotion is a high-signal moment — sorts above ambient cards
    startsAt: null,
    endsAt: null,
    steps: TOUR_STEPS[step],
    updatedAt: null,
    updatedBy: null,
    createdAt: null,
  }
}

/** Every shipped role-promotion tour, lowest rung first. */
export function allRolePromotionWalkthroughs(): Walkthrough[] {
  return (['host', 'guide', 'mentor'] as PromotionStep[]).map(rolePromotionWalkthrough)
}

// ── Pure selection logic (unit-tested) ────────────────────────────────────────────

/** Is `role` one of the rungs that has a promotion tour? */
function isPromotionStep(role: CommunityRole): role is PromotionStep {
  return role === 'host' || role === 'guide' || role === 'mentor'
}

/**
 * Which promotion tours does a move from `from` → `to` newly unlock? Returns each
 * rung CROSSED that has a tour, lowest first. Examples:
 *   - member → host   → ['host']
 *   - host   → guide  → ['guide']
 *   - member → mentor → ['host', 'guide', 'mentor']  (a multi-rung jump unlocks each)
 *   - guide  → host   → []   (a demotion unlocks nothing)
 *   - host   → host   → []   (no change)
 * `from` may be null (a brand-new grant with no prior role).
 */
export function promotionStepsCrossed(
  from: CommunityRole | null | undefined,
  to: CommunityRole,
): PromotionStep[] {
  const fromRank = roleRank(from ?? null) // -1 when null/unknown
  const toRank = roleRank(to)
  if (toRank <= fromRank) return [] // no advance (or a demotion) → nothing
  const out: PromotionStep[] = []
  for (const rung of ROLE_HIERARCHY) {
    const r = roleRank(rung)
    if (r > fromRank && r <= toRank && isPromotionStep(rung)) out.push(rung)
  }
  return out
}

/**
 * Given the member's CURRENT role and their saved progress map, pick the single
 * highest-rung promotion tour that is pending and not yet finished, or null. Pending =
 * assignRole stamped a `pendingAt` for that slug (so the tour only fires after an actual
 * promotion, never just because someone happens to hold the role). Finished = completed
 * or dismissed. Pure so the surfacing component stays a thin wrapper.
 */
export function selectPendingPromotionTour(
  role: CommunityRole | null | undefined,
  progress: Record<string, { pendingAt?: string; completedAt?: string; dismissedAt?: string } | undefined>,
): Walkthrough | null {
  // Scan every pending-and-unfinished promotion slug and keep the highest rung the member
  // still holds. We don't require `role` to BE a promotion rung: a member promoted to host
  // then later moved should still see a pending host tour if their current rank allows it.
  // An unknown role (rank -1) holds nothing → nothing surfaces (fail-closed).
  const currentRank = roleRank(role ?? null)
  if (currentRank < 0) return null
  let best: { step: PromotionStep; rank: number } | null = null
  for (const slug of ROLE_PROMOTION_SLUGS) {
    const p = progress[slug]
    if (!p?.pendingAt) continue
    if (p.completedAt || p.dismissedAt) continue
    const step = SLUG_TO_PROMOTION_STEP[slug]
    const rank = roleRank(step)
    // Don't surface a tour for a rung the member no longer holds (e.g. demoted before
    // they ever opened it).
    if (rank > currentRank) continue
    if (!best || rank > best.rank) best = { step, rank }
  }
  return best ? rolePromotionWalkthrough(best.step) : null
}
