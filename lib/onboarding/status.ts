import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'
import { getWalkthrough } from '@/lib/walkthroughs'
import {
  buildOnboardingSteps,
  ONBOARDING_WALKTHROUGH_SLUG,
  type OnboardingStep,
  type OnboardingStepKey,
} from '@/lib/onboarding/steps'

// Single source of truth for "where is this member in activation?" Both the feed
// hero (the persistent onboarding guide) and any sidebar nudge read this, so they
// can never disagree. The funnel ends at the North-Star moment: a verified practice.

// Master switch for the legacy hardcoded Next Steps prompts — the feed onboarding
// card (FeedOnboardingGuide) and the left "Next Steps"/chores edge pill + its popup
// (ChoresOverlay). Shipped OFF: the operator-authored Walkthroughs suite (Acquisition
// → Onboarding) is taking over this surface, so the old hardcoded nudges are dark
// until that lands. The status computation below still runs (other code reads
// `complete`/`current` for stage gating); only the visible prompts are gated. Flip
// the platform_flags.next_steps_enabled row (operator control at /admin/onboarding-controls)
// to restore the old Next Steps cards and popups everywhere at once. Defaults to FALSE
// on a missing row or read failure — matches the current shipped state. Cached per
// request (React cache) so the surfaces that gate on it share one round trip.
export const nextStepsEnabled = cache(async (): Promise<boolean> => {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'next_steps_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
})

// The step model + default copy now live in lib/onboarding/steps.ts (pure, testable, and
// shared with the walkthroughs editor). Re-export so existing importers are unaffected.
export type { OnboardingStep, OnboardingStepKey } from '@/lib/onboarding/steps'

export interface OnboardingStatus {
  steps: OnboardingStep[]
  /** Incomplete steps only, in order. */
  todo: OnboardingStep[]
  /** The next thing to do (first incomplete step), or null when complete. */
  current: OnboardingStep | null
  doneCount: number
  total: number
  pct: number
  complete: boolean
}

export async function getOnboardingStatus(profileId: string): Promise<OnboardingStatus> {
  const admin = createAdminClient()

  const [profileRes, membershipRes, practiceRes, myPractices, authored] = await Promise.all([
    admin.from('profiles').select('avatar_url, meta').eq('id', profileId).maybeSingle(),
    admin.from('memberships').select('id').eq('profile_id', profileId).eq('status', 'active').limit(1),
    admin
      .from('engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_profile_id', profileId)
      .eq('event_type', 'practice.verified'),
    getMemberPractices(profileId),
    // The operator-authored funnel copy/order (best-effort; null falls back to defaults).
    getWalkthrough(ONBOARDING_WALKTHROUGH_SLUG),
  ])

  // Done-detection stays in code — never trusts operator input. Keyed by criterion.
  const done: Record<OnboardingStepKey, boolean> = {
    avatar: !!profileRes.data?.avatar_url,
    circle: (membershipRes.data ?? []).length > 0,
    practice: myPractices.length > 0,
    log: (practiceRes.count ?? 0) > 0,
  }

  // Force-complete overrides: a member can force a step done via the onboarding guide's
  // obscured escape hatch (forceOnboardingStep). Stored in profiles.meta.onboarding.forced[].
  const meta = (profileRes.data?.meta ?? null) as { onboarding?: { forced?: string[] } } | null
  for (const key of meta?.onboarding?.forced ?? []) {
    if (key in done) done[key as OnboardingStepKey] = true
  }

  // Operator-authored slides (only those tagged with a criterion) override the copy/order;
  // an unauthored / inactive / empty walkthrough yields the shipped default funnel.
  const slides = authored?.active ? authored.steps : []
  const steps: OnboardingStep[] = buildOnboardingSteps(slides, done)

  const todo = steps.filter((s) => !s.done)
  const doneCount = steps.length - todo.length

  return {
    steps,
    todo,
    current: todo[0] ?? null,
    doneCount,
    total: steps.length,
    pct: Math.round((doneCount / steps.length) * 100),
    complete: todo.length === 0,
  }
}
