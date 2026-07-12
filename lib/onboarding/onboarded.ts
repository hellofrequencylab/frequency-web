// Pure, dependency-free predicate: has this member EFFECTIVELY finished onboarding?
//
// The canonical marker is `profiles.meta.onboarding_completed`, set by the induction
// write (app/onboarding/beta/actions.ts). But accounts that predate the induction gate
// — seeded accounts, or members who used the app before BETA_INDUCTION_ACTIVE was
// blocking — never got that flag, yet are plainly established members. Gating solely on
// the flag re-forces them through the beta-launch induction on EVERY sign-in (a bug).
//
// So we also treat clear evidence of PRIOR APP USE as equivalent to the flag. Every
// signal below is only reachable AFTER passing the onboarding gate (the in-app tour,
// earned Zaps/Gems) or is only stamped at full induction completion (beta.completed_at),
// so a genuinely-new member who has not finished onboarding never trips them. Client-safe
// (no imports) so it can be shared by the layout gate and the onboarding pages.

export interface OnboardedSignals {
  /** The raw `profiles.meta` JSON blob. */
  meta: unknown
  /** `profiles.current_season_zaps` (optional; treated as 0 when absent). */
  currentSeasonZaps?: number | null
  /** `profiles.lifetime_gems` (optional; treated as 0 when absent). */
  lifetimeGems?: number | null
}

interface OnboardingMeta {
  onboarding_completed?: boolean
  beta?: { completed_at?: string | null } | null
  tour?: { seen?: unknown } | null
}

/**
 * True when the member should NOT be re-forced through beta-launch onboarding: either
 * the explicit completion flag is set, or there is unambiguous evidence they have
 * already been through the app. Genuinely-new members (empty meta, no economy, no tour
 * history) return false, so real onboarding is never skipped.
 */
export function hasEffectivelyOnboarded(signals: OnboardedSignals): boolean {
  const meta = (signals.meta ?? null) as OnboardingMeta | null

  // 1) The explicit marker always wins.
  if (meta?.onboarding_completed === true) return true

  // 2) Fully completed the induction before (stamped only at completion, alongside the
  //    flag) — covers a write where the top-level flag somehow didn't land.
  if (meta?.beta?.completed_at) return true

  // 3) Seen onboarding tour cues — only possible from INSIDE the app shell, which an
  //    un-onboarded member can't reach (the gate redirects them out first).
  if (Array.isArray(meta?.tour?.seen) && meta.tour.seen.length > 0) return true

  // 4) Earned in the game (Zaps this season or Gems ever) — impossible without having
  //    actually used the app past onboarding.
  if ((signals.currentSeasonZaps ?? 0) > 0) return true
  if ((signals.lifetimeGems ?? 0) > 0) return true

  return false
}
