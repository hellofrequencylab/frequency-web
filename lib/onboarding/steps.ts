// The first-run checklist — the activation funnel's content + shape, kept pure (no DB, no
// server-only) so it can be unit-tested and shared between the status reader
// (lib/onboarding/status.ts) and the walkthroughs editor. The four CRITERIA are the real
// activation checks the status reader computes against member state; this module owns the
// default operator copy and the merge that lets an operator-authored walkthrough override
// that copy/order while the done-detection stays in code.
//
// THE CHECKLIST IS THE MODEL (LIVE-259). Four steps, in the order a person actually meets
// them: a photo, then a Circle, then an Event, then hosting something of their own. It used
// to run photo → circle → adopt a practice → log a practice, which spent half the funnel
// inside one noun and never once mentioned an Event or a Space. People join free and
// businesses host free, so the last step is an invitation, not an upsell.

/** The four activation milestones — these double as the step `key` AND the per-slide
 *  `criterion` an operator tags a checklist slide with. The force-complete escape hatch
 *  (forceOnboardingStep) and the feed/sidebar surfaces all key off these exact values. */
export type OnboardingStepKey = 'avatar' | 'circle' | 'event' | 'host'

export const ONBOARDING_CRITERIA: readonly OnboardingStepKey[] = ['avatar', 'circle', 'event', 'host']

/** Editor-facing labels for the per-slide "Activation step" picker. */
export const CRITERION_LABELS: Record<OnboardingStepKey, string> = {
  avatar: 'Add a profile photo',
  circle: 'Join a Circle',
  event: 'Come to an Event',
  host: 'Host something',
}

/** The reserved walkthrough slug that authors the first-run checklist. The feed-card runtime
 *  skips this slug (it renders as the persistent activation guide, never a dismissible
 *  card), and the status reader pulls its slides for operator-authored copy/order. */
export const ONBOARDING_WALKTHROUGH_SLUG = 'onboarding-next-steps'

export interface OnboardingStep {
  key: OnboardingStepKey
  label: string
  /** Short imperative used as the hero headline when this is the current step. */
  headline: string
  /** One inviting line shown under the headline when this is the current step. */
  blurb: string
  href: string
  /** Label for the step's primary CTA button. */
  cta: string
  done: boolean
}

/** The default copy for each milestone — the shipped funnel and the per-field fallback when
 *  an operator authors a slide but leaves a field blank. `done` is filled in by the reader. */
export const DEFAULT_ONBOARDING_STEPS: Record<OnboardingStepKey, Omit<OnboardingStep, 'done'>> = {
  avatar: {
    key: 'avatar',
    label: 'Add a profile photo',
    headline: 'Add a face to your name',
    blurb: 'A photo helps your people recognize you. Takes ten seconds.',
    href: '/settings/profile',
    cta: 'Add a photo',
  },
  circle: {
    key: 'circle',
    label: 'Join a Circle',
    headline: 'Join your first Circle',
    blurb: 'A Circle is a small group around one shared thing. Join one and the rest of this place starts to make sense.',
    href: '/circles',
    cta: 'Browse Circles',
  },
  event: {
    key: 'event',
    label: 'Come to an Event',
    headline: 'Come to an Event',
    blurb: 'An Event is where the names on your screen turn into people in your week. Find one near you and say you are coming.',
    href: '/events',
    cta: 'Find an Event',
  },
  host: {
    key: 'host',
    label: 'Host something',
    headline: 'Host something of your own',
    blurb: 'Start a Circle, put an Event on the calendar, or open a Space for your business. Hosting is free, and it is how this place grows.',
    href: '/circles/new',
    cta: 'Start hosting',
  },
}

/** The shipped default order (used when no walkthrough authors the checklist). */
export const DEFAULT_ONBOARDING_ORDER: readonly OnboardingStepKey[] = ['avatar', 'circle', 'event', 'host']

/** A single authored slide, reduced to just what the checklist needs. Mirrors WalkthroughStep
 *  but stays dependency-free so this module imports nothing. */
export interface AuthoredOnboardingStep {
  criterion?: OnboardingStepKey
  title?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
}

function isCriterion(v: unknown): v is OnboardingStepKey {
  return typeof v === 'string' && (ONBOARDING_CRITERIA as readonly string[]).includes(v)
}

/**
 * Build the funnel's steps from the operator-authored slides (if any) and the computed
 * done-map. Pure — the testable core.
 *   - Each authored slide that carries a recognized `criterion` contributes one step, in
 *     authored order, deduped (first slide per criterion wins). Blank fields fall back to
 *     that criterion's default copy, so a half-authored slide still reads well.
 *   - If no slide carries a valid criterion, the full default funnel is used in default
 *     order — exactly the shipped behaviour, so a missing/empty walkthrough changes nothing.
 *   - `done` always comes from the code-computed map, never from operator input.
 */
export function buildOnboardingSteps(
  authored: AuthoredOnboardingStep[] | null | undefined,
  done: Record<OnboardingStepKey, boolean>,
): OnboardingStep[] {
  const tagged = (authored ?? []).filter((s) => isCriterion(s.criterion))

  if (tagged.length === 0) {
    return DEFAULT_ONBOARDING_ORDER.map((key) => ({ ...DEFAULT_ONBOARDING_STEPS[key], done: !!done[key] }))
  }

  const seen = new Set<OnboardingStepKey>()
  const out: OnboardingStep[] = []
  for (const s of tagged) {
    const key = s.criterion as OnboardingStepKey
    if (seen.has(key)) continue
    seen.add(key)
    const d = DEFAULT_ONBOARDING_STEPS[key]
    const title = s.title?.trim()
    out.push({
      key,
      label: title || d.label,
      headline: title || d.headline,
      blurb: s.body?.trim() || d.blurb,
      href: s.ctaHref?.trim() || d.href,
      cta: s.ctaLabel?.trim() || d.cta,
      done: !!done[key],
    })
  }
  return out
}
