// THE LIFECYCLE REGISTRY (EMAIL-047). Every automatic follow-up email Frequency sends, declared once: what triggers it,
// who gets it, how important it is when two are due, and where its builder lives. The cap (lib/lifecycle/cap.ts) reads the
// rank; the coverage test (registry.test.ts) fails when a listed builder file is missing, so the list cannot rot. Plan:
// email/COACH-EMAIL-SYSTEM-BUILD-PLAN-2026-11-13.md. PURE data, no imports from the app.

/** 1 = a person is waiting on it, beats the daily cap. 2 = guidance tied to what they just did. 3 = nurture and nudges. */
type LifecycleRank = 1 | 2 | 3

interface LifecycleEmail {
  /** The kind stored in lifecycle_send_log. Lowercase, underscores. */
  kind: string
  label: string
  trigger: string
  audience: 'member' | 'space_owner' | 'lead' | 'guest'
  rank: LifecycleRank
  /** Where the builder lives, repo-relative. The test checks the file exists. */
  file: string
}

export const LIFECYCLE_EMAILS: readonly LifecycleEmail[] = [
  { kind: 'launch_comeback', label: 'Launch come-back (1h, 1d, 3d)', trigger: 'Stopped partway through the launch', audience: 'space_owner', rank: 2, file: 'lib/launch/comeback-email.ts' },
  { kind: 'launched_welcome', label: 'You are live', trigger: 'Launch completed', audience: 'space_owner', rank: 1, file: 'lib/launch/launched-email.ts' },
  { kind: 'create_space_draft', label: 'Draft reminder (1h, 1d, 3d)', trigger: 'Saved a Create a Space draft and stopped', audience: 'lead', rank: 2, file: 'lib/create-space/draft-recovery-email.ts' },
  { kind: 'operator_lifecycle', label: 'New Space owner (day 1, 3, 7)', trigger: 'Days since the Space opened', audience: 'space_owner', rank: 2, file: 'lib/marketing/operator-emails.ts' },
  { kind: 'signup_recovery', label: 'Finish setting up your account', trigger: 'Left the sign-up cold for 24 hours', audience: 'lead', rank: 3, file: 'lib/crm/signup-lead-recovery.ts' },
  { kind: 'nurture_step', label: 'Persona nurture step', trigger: 'Time since a /start lead was captured', audience: 'lead', rank: 3, file: 'lib/nurture/runner.ts' },
  { kind: 'made_it', label: 'Did you make it?', trigger: 'The day after a gathering', audience: 'guest', rank: 2, file: 'lib/events/dispatch.ts' },
  { kind: 'this_week', label: 'This week', trigger: 'Weekly', audience: 'member', rank: 3, file: 'lib/this-week.ts' },
  { kind: 'weekly_digest', label: 'Weekly digest', trigger: 'Weekly', audience: 'member', rank: 3, file: 'app/api/cron/weekly-digest/route.ts' },
]

const BY_KIND: ReadonlyMap<string, LifecycleEmail> = new Map(LIFECYCLE_EMAILS.map((e) => [e.kind, e]))

/** The rank of a registered kind, or 3 for anything unregistered (the strictest reading). */
export function lifecycleRank(kind: string): LifecycleRank {
  return BY_KIND.get(kind)?.rank ?? 3
}
