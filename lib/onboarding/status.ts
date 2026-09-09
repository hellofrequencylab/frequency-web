import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWalkthrough } from '@/lib/walkthroughs'
import {
  buildOnboardingSteps,
  ONBOARDING_WALKTHROUGH_SLUG,
  type OnboardingStep,
  type OnboardingStepKey,
} from '@/lib/onboarding/steps'

// Single source of truth for "where is this member in activation?" Both the feed
// hero (the persistent onboarding guide) and any sidebar nudge read this, so they
// can never disagree.
//
// The checklist is the model (LIVE-259): a photo, a Circle, an Event, then hosting
// something of their own. The done-detection below is the code half of that — one
// real signal per noun, never operator input. It ends on HOSTING because hosting is
// free, and a member who has hosted once has met every noun the product is made of.

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

// Request-cached (React cache): each call issues ~5 DB round-trips, and multiple surfaces in one
// render read the same value (the authed layout's coach/tour reads, the feed hero, sidebar nudges),
// so memoize per request to share a single computation. Pure per-profile read — no behavior change.
export const getOnboardingStatus = cache(async (profileId: string): Promise<OnboardingStatus> => {
  const admin = createAdminClient()

  const [profileRes, membershipRes, rsvpRes, hostCircleRes, hostEventRes, ownSpaceRes, authored] =
    await Promise.all([
      admin.from('profiles').select('avatar_url, meta').eq('id', profileId).maybeSingle(),
      admin.from('memberships').select('id').eq('profile_id', profileId).eq('status', 'active').limit(1),
      // "Came to an Event" = they said they are coming. A `not_going` RSVP is an answer, not an
      // arrival, so only `going` counts.
      admin.from('event_rsvps').select('id').eq('profile_id', profileId).eq('status', 'going').limit(1),
      // "Hosted something" = any one of the three things a person can host. Three cheap
      // existence probes rather than one clever join, so a schema change to any of them
      // degrades to "not yet" instead of throwing.
      admin.from('circles').select('id').eq('host_id', profileId).limit(1),
      admin.from('events').select('id').eq('host_id', profileId).limit(1),
      admin.from('spaces').select('id').eq('owner_profile_id', profileId).limit(1),
      // The operator-authored checklist copy/order (best-effort; null falls back to defaults).
      getWalkthrough(ONBOARDING_WALKTHROUGH_SLUG),
    ])

  // Done-detection stays in code — never trusts operator input. Keyed by criterion.
  const done: Record<OnboardingStepKey, boolean> = {
    avatar: !!profileRes.data?.avatar_url,
    circle: (membershipRes.data ?? []).length > 0,
    event: (rsvpRes.data ?? []).length > 0,
    host:
      (hostCircleRes.data ?? []).length > 0 ||
      (hostEventRes.data ?? []).length > 0 ||
      (ownSpaceRes.data ?? []).length > 0,
  }

  // Force-complete overrides: a member can force a step done via the onboarding guide's
  // obscured escape hatch (forceOnboardingStep). Stored in profiles.meta.onboarding.forced[].
  const meta = (profileRes.data?.meta ?? null) as { onboarding?: { forced?: string[] } } | null
  for (const key of meta?.onboarding?.forced ?? []) {
    if (key in done) done[key as OnboardingStepKey] = true
  }

  // Operator-authored slides (only those tagged with a criterion) override the copy/order;
  // an unauthored / inactive / empty walkthrough yields the shipped default checklist.
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
})
