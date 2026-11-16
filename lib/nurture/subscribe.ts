// The /subscribe nurture (the casual-browser series: day 0, 3, 10). A double-opt-in confirm on /subscribe
// enrolls the contact in the nurture sequence stored under this key; the cron (lib/nurture/runner.ts) sends
// each step through the lifecycle cap (one a day, three a week when LIFECYCLE_CAP_ENABLED is on). The key is
// not an onboarding persona, so the persona picker never offers it; the nurture admin page lists it as its own
// card so the operator edits the three emails in place.

export const SUBSCRIBE_NURTURE_KEY = 'subscribe'

/** The card copy on /admin/marketing/nurture for the /subscribe series. */
export const SUBSCRIBE_NURTURE_CARD = {
  label: 'Casual browsers (/subscribe)',
  emoji: '📬',
  pitch: 'People who confirmed their email on /subscribe. Three notes before launch: day 0, day 3 and day 10.',
} as const
