// Guided-setup goal catalog (EMAIL-CAMPAIGNS-FUNNELS-PLAN P3, ask #3 + #6). The "New"
// front door never opens a blank canvas: the operator picks a GOAL, and each goal maps
// to one of the two objects (a one-time Campaign or a triggered Funnel), carries the
// best-practice shape as its default, and ships inline tips. Client-safe + pure (no
// server imports) so the wizard reads it directly. Copy is plain, proper nouns carry
// the magic, no em dashes (CONTENT-VOICE §10). Best-practice sourcing is in the plan
// doc (welcome/nurture series = 4 to 6 emails, behavioral triggers, one CTA).

/** The two things an operator creates. */
export type MessagingObject = 'campaign' | 'funnel'

/** A suggested step in a Funnel's best-practice outline (presentational: it seeds the
 *  operator's mental model and the flow view's timing hints). */
export interface GoalStep {
  title: string
  /** Human timing relative to the previous step. */
  timing: string
  /** One plain line on what the step does. */
  note: string
}

export interface MessagingGoal {
  key: string
  label: string
  /** Which object this goal builds. */
  object: MessagingObject
  /** One-line "what this is for" on the goal card. */
  blurb: string
  /** The trigger question is only meaningful for a Funnel. */
  triggerHint?: string
  /** Best-practice tips shown inline during setup. */
  tips: readonly string[]
  /** A Funnel's suggested step outline (the best-practice series). */
  outline?: readonly GoalStep[]
  /** The engagement event a Funnel converts on (seeds funnels.goal_event). */
  goalEvent?: string
  /** Suggested default name, pre-filled in the questions step. */
  suggestedName: string
}

export const MESSAGING_GOALS: readonly MessagingGoal[] = [
  {
    key: 'welcome',
    label: 'Welcome new members',
    object: 'funnel',
    blurb: 'Greet someone the moment they join and walk them to their first win.',
    triggerHint: 'Someone joins Frequency',
    goalEvent: 'practice_verified',
    suggestedName: 'Welcome series',
    tips: [
      'Welcome emails see about 4x the opens of a normal send. Make the first one count.',
      'Send the first email within a minute of joining, while they are still around.',
      'Keep each email to one clear next step, not a list of five.',
    ],
    outline: [
      { title: 'Welcome', timing: 'Right away', note: 'Say hello and set what to expect.' },
      { title: 'Get started', timing: '1 day later', note: 'Point to the one thing to do first.' },
      { title: 'Find your people', timing: '3 days later', note: 'Nudge them into a Circle near them.' },
      { title: 'Your first practice', timing: '5 days later', note: 'Invite them to log a practice.' },
      { title: 'Check in', timing: '8 days later', note: 'Ask how it is going and offer a hand.' },
    ],
  },
  {
    key: 'nurture',
    label: 'Nurture leads',
    object: 'funnel',
    blurb: 'Warm up someone who signed up but has not committed yet.',
    triggerHint: 'A contact is captured or tagged',
    goalEvent: 'signup',
    suggestedName: 'Lead nurture',
    tips: [
      'Lead with what they get, not what you want. One value per email.',
      'Space the emails out. A few days between steps beats a daily drip.',
      'Give every email one reason to reply or click.',
    ],
    outline: [
      { title: 'Why Frequency', timing: 'Right away', note: 'The one-line reason this is for them.' },
      { title: 'Proof', timing: '2 days later', note: 'A real story from a member or Circle.' },
      { title: 'The offer', timing: '4 days later', note: 'The clear invitation to take the next step.' },
      { title: 'Last nudge', timing: '7 days later', note: 'A friendly final reminder with the same CTA.' },
    ],
  },
  {
    key: 'reengage',
    label: 'Re-engage the quiet',
    object: 'funnel',
    blurb: 'Reach someone who has gone quiet and give them a reason to come back.',
    triggerHint: 'A member goes quiet',
    goalEvent: 'practice_verified',
    suggestedName: 'Win-back series',
    tips: [
      'Name the gap plainly and warmly. No guilt.',
      'Lead with what changed or what they missed, not "we miss you".',
      'Make coming back a single tap.',
    ],
    outline: [
      { title: 'We saved your spot', timing: 'Right away', note: 'A warm, low-pressure hello.' },
      { title: 'What you missed', timing: '3 days later', note: 'One highlight worth returning for.' },
      { title: 'One easy step back', timing: '6 days later', note: 'The single action to re-engage.' },
    ],
  },
  {
    key: 'promo',
    label: 'Promote an event',
    object: 'campaign',
    blurb: 'Send one email about an event, a launch, or an offer to a chosen audience.',
    suggestedName: 'Event announcement',
    tips: [
      'One subject, one ask. Say the date and the action up top.',
      'Pick the tightest audience that still fits. A smaller, right list beats a big, wrong one.',
      'Preview the audience size before you send.',
    ],
  },
  {
    key: 'announce',
    label: 'Announce or broadcast',
    object: 'campaign',
    blurb: 'A one-time update to members: news, a change, or a heads up.',
    suggestedName: 'Announcement',
    tips: [
      'Put the news in the first line. People skim.',
      'Keep it short. One update per send.',
      'Every send carries a one-click unsubscribe. Say what they signed up for.',
    ],
  },
]

export function getMessagingGoal(key: string): MessagingGoal | null {
  return MESSAGING_GOALS.find((g) => g.key === key) ?? null
}

/** The tones the wizard offers for a draft's voice (seeds the manual scaffold +, later,
 *  the Vera prompt). Plain labels; the voice canon still governs the final copy. */
export const MESSAGING_TONES: readonly { key: string; label: string }[] = [
  { key: 'warm', label: 'Warm and personal' },
  { key: 'plain', label: 'Plain and direct' },
  { key: 'upbeat', label: 'Upbeat and energetic' },
]
