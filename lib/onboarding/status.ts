import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'

// Single source of truth for "where is this member in activation?" Both the feed
// hero (the persistent onboarding guide) and any sidebar nudge read this, so they
// can never disagree. The funnel ends at the North-Star moment: a verified practice.

// Master switch for the legacy hardcoded Next Steps prompts — the feed onboarding
// card (FeedOnboardingGuide) and the left "Next Steps"/chores edge pill + its popup
// (ChoresOverlay). Shipped OFF: the operator-authored Walkthroughs suite (Acquisition
// → Onboarding) is taking over this surface, so the old hardcoded nudges are dark
// until that lands. The status computation below still runs (other code reads
// `complete`/`current` for stage gating); only the visible prompts are gated. Flip
// this to `true` to restore the old Next Steps cards and popups everywhere at once.
export const NEXT_STEPS_ENABLED = false

export type OnboardingStepKey = 'avatar' | 'circle' | 'practice' | 'log'

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

  const [profileRes, membershipRes, practiceRes, myPractices] = await Promise.all([
    admin.from('profiles').select('avatar_url, meta').eq('id', profileId).maybeSingle(),
    admin.from('memberships').select('id').eq('profile_id', profileId).eq('status', 'active').limit(1),
    admin
      .from('engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_profile_id', profileId)
      .eq('event_type', 'practice.verified'),
    getMemberPractices(profileId),
  ])

  const steps: OnboardingStep[] = [
    {
      key: 'avatar',
      label: 'Add a profile photo',
      headline: 'Add a face to your name',
      blurb: 'A photo helps your people recognize you. Takes ten seconds.',
      href: '/settings/profile',
      cta: 'Add a photo',
      done: !!profileRes.data?.avatar_url,
    },
    {
      key: 'circle',
      label: 'Join or start a circle',
      headline: 'Find your first circle',
      blurb: 'Circles are where Frequency actually happens. Join one and your feed comes alive.',
      href: '/circles',
      cta: 'Browse circles',
      done: (membershipRes.data ?? []).length > 0,
    },
    {
      key: 'practice',
      label: 'Adopt a practice',
      headline: 'Adopt a practice',
      blurb: 'Pick one small thing to do for yourself. It’s the heartbeat of this place.',
      href: '/practices',
      cta: 'Explore practices',
      done: myPractices.length > 0,
    },
    {
      key: 'log',
      label: 'Log your first practice',
      headline: 'Log your first practice',
      blurb: 'Show up once. That single check-in starts your streak and your story here.',
      href: '/practices',
      cta: 'Log it',
      done: (practiceRes.count ?? 0) > 0,
    },
  ]

  // Force-complete overrides: a member can force a step done via the onboarding
  // guide's obscured escape hatch (forceOnboardingStep). Stored in
  // profiles.meta.onboarding.forced[]. Treated as done so the guide can graduate.
  const meta = (profileRes.data?.meta ?? null) as { onboarding?: { forced?: string[] } } | null
  const forced = new Set(meta?.onboarding?.forced ?? [])
  for (const s of steps) if (forced.has(s.key)) s.done = true

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
