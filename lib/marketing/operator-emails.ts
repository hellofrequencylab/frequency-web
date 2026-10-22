// The operator lifecycle emails (LIVE-1141): what a new Space owner hears from Frequency on day 0 (the moment the Space opens), 1, 3 and 7. PURE, so the
// stock catalog and the tests render them with fixtures. One sequence, four short variants keyed by what the Space runs
// (its mode variant), because that is the one thing we know for certain; the six doors fold into those four. The Crew
// line is PLAN_STORY.crewSpace, stated once, on day 0. Account-adjacent guidance, so the standard footer and its
// unsubscribe control stay; the cron gates every send through the lifecycle send gate.
import { emailButton, emailShell, EMAIL_P, escapeHtml, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'
import { PLAN_STORY } from '@/lib/pricing/plan-story'

export type OperatorDay = 0 | 1 | 3 | 7
/** Day 0 goes out the moment the Space is created; the daily cron sends the rest. */
export const OPERATOR_DAYS: readonly OperatorDay[] = [0, 1, 3, 7]

export type OperatorFocus = 'packages' | 'membership' | 'ticketed' | 'donations' | 'venue' | 'network' | 'general'

/** What a Space runs, from its type and Focus. Anything unknown reads as general. */
export function operatorFocus(
  type: string | null | undefined,
  variant: string | null | undefined,
  /** The Space's kind (preferences.profileData.kind) and whether it has member Spaces; both optional. */
  extra: { kind?: string | null; hasChapters?: boolean } = {},
): OperatorFocus {
  if (extra.hasChapters) return 'network'
  if (extra.kind === 'venue') return 'venue'
  if (type === 'nonprofit') return 'donations'
  if (variant === 'packages' || variant === 'appointments' || variant === 'cohort' || variant === 'service') return 'packages'
  if (variant === 'membership') return 'membership'
  if (variant === 'ticketed') return 'ticketed'
  if (variant === 'donations' || variant === 'programs') return 'donations'
  return 'general'
}

type Step = { subject: string; lines: string[]; cta: string; path: 'public' | 'manage' }

const DAY_0: Record<OperatorFocus, Step> = {
  packages: {
    subject: 'Your Space is open. Add your first offer.',
    lines: ['Your page is live. The one thing worth doing today is adding a single offer with a price, so the first person who finds you can book.'],
    cta: 'Add your first offer',
    path: 'manage',
  },
  membership: {
    subject: 'Your Space is open. Set up your first membership.',
    lines: ['Your page is live. Start with one membership or class so the first person who finds you has something to join.'],
    cta: 'Set up a membership',
    path: 'manage',
  },
  ticketed: {
    subject: 'Your Space is open. Put your first event on it.',
    lines: ['Your page is live. Add your next event with a date and a ticket, and people can start saying yes.'],
    cta: 'Add your first event',
    path: 'manage',
  },
  donations: {
    subject: 'Your Space is open. Tell your story.',
    lines: ['Your page is live. Start with two or three sentences on what you do and who it helps, then turn on giving.'],
    cta: 'Finish your page',
    path: 'manage',
  },
  venue: {
    subject: 'Your Space is open. Show people the room.',
    lines: ['Your page is live. Add a photo of the space, its capacity and how to ask for a date, so a host can picture an event there.'],
    cta: 'Finish your venue page',
    path: 'manage',
  },
  network: {
    subject: 'Your Space is open. Add your first chapter.',
    lines: ['Your page is live. Add your first chapter and its lead, so the network has a home people can find by city.'],
    cta: 'Add a chapter',
    path: 'manage',
  },
  general: {
    subject: 'Your Space is open. Here is the first step.',
    lines: ['Your page is live. Start by adding what you offer, with a date or a price, so the first visitor knows what to do.'],
    cta: 'Open your Space',
    path: 'manage',
  },
}

const DAY_1_STEP: Step = {
  subject: 'Make your page yours.',
  lines: ['A page with a photo and a few plain sentences about you gets more yeses than a blank one. It takes five minutes: add a photo, say who you help, and say what to do next.'],
  cta: 'Finish your page',
  path: 'manage',
}
const DAY_1: Record<OperatorFocus, Step> = {
  packages: DAY_1_STEP,
  membership: DAY_1_STEP,
  ticketed: DAY_1_STEP,
  donations: DAY_1_STEP,
  venue: {
    subject: 'Make your venue easy to picture.',
    lines: ['Hosts choose a room they can see. Add two or three photos, the capacity, and the plain details: parking, hours, what is included.'],
    cta: 'Finish your venue page',
    path: 'manage',
  },
  network: {
    subject: 'Give each chapter a clear page.',
    lines: ['Each chapter needs a city, a lead and a line on what it does. Fill in the first one fully, then copy the pattern for the rest.'],
    cta: 'Open your chapters',
    path: 'manage',
  },
  general: DAY_1_STEP,
}

const DAY_3: Record<OperatorFocus, Step> = {
  packages: {
    subject: 'Three days in. Share your page once.',
    lines: ['Send your page link to five people who already know your work. Ask them to book or share it. Five warm messages beat any amount of posting.'],
    cta: 'Copy your page link',
    path: 'public',
  },
  membership: {
    subject: 'Three days in. Invite your regulars.',
    lines: ['Your regulars are your first members. Send each of them your page link and tell them why you moved your schedule here.'],
    cta: 'Copy your page link',
    path: 'public',
  },
  ticketed: {
    subject: 'Three days in. Tell people about your event.',
    lines: ['Share your event link where your people already are: one group chat, one email to your list, one post. Then check the guest list tomorrow.'],
    cta: 'See your page',
    path: 'public',
  },
  donations: {
    subject: 'Three days in. Ask one supporter.',
    lines: ['Send your page to one person who already cares about your work, with a plain note on what a gift does. One real ask teaches you more than ten posts.'],
    cta: 'Copy your page link',
    path: 'public',
  },
  venue: {
    subject: 'Three days in. Tell hosts you are open.',
    lines: ['Send your page to three people who run events: a teacher, a promoter, a group leader. Ask which dates they would want.'],
    cta: 'Copy your page link',
    path: 'public',
  },
  network: {
    subject: 'Three days in. Invite a chapter lead.',
    lines: ['Pick one person in another city who already runs gatherings and send them your network page. One lead who says yes is worth more than a list.'],
    cta: 'Copy your page link',
    path: 'public',
  },
  general: {
    subject: 'Three days in. Share your page once.',
    lines: ['Send your page link to five people who already know your work, and ask them to take one step on it.'],
    cta: 'Copy your page link',
    path: 'public',
  },
}

const DAY_7: Record<OperatorFocus, Step> = {
  packages: {
    subject: 'A week in. See what happened.',
    lines: ['Open your Space and look at who visited and who booked. If nobody booked yet, change one thing on your offer and share the link again.'],
    cta: 'Open your Space',
    path: 'manage',
  },
  membership: {
    subject: 'A week in. See who joined.',
    lines: ['Open your Space and look at who joined and who came to a class. Message the people who looked and did not join. Most only needed a nudge.'],
    cta: 'Open your Space',
    path: 'manage',
  },
  ticketed: {
    subject: 'A week in. Check your guest list.',
    lines: ['Open your Space and look at your guest list. Message everyone who said yes with the time and place, and add a second date if the first one is filling.'],
    cta: 'Open your Space',
    path: 'manage',
  },
  donations: {
    subject: 'A week in. Thank your first supporters.',
    lines: ['Open your Space and look at who gave or signed up. A short personal thank you now is what turns a first gift into a second.'],
    cta: 'Open your Space',
    path: 'manage',
  },
  venue: {
    subject: 'A week in. Check your requests.',
    lines: ['Open your Space and look at the date requests. Answer each one the same day, and offer a second date if the first is taken.'],
    cta: 'Open your Space',
    path: 'manage',
  },
  network: {
    subject: 'A week in. See your chapters.',
    lines: ['Open your Space and look at which chapters are set up and which have a lead. Message the ones that are stuck and ask what they need.'],
    cta: 'Open your Space',
    path: 'manage',
  },
  general: {
    subject: 'A week in. See what happened.',
    lines: ['Open your Space and look at who visited and what they did. Change one thing, then share your link again.'],
    cta: 'Open your Space',
    path: 'manage',
  },
}

const STEPS: Record<OperatorDay, Record<OperatorFocus, Step>> = { 0: DAY_0, 1: DAY_1, 3: DAY_3, 7: DAY_7 }

export function buildOperatorEmail(parts: {
  day: OperatorDay
  focus: OperatorFocus
  to: string
  greetingName: string | null
  spaceName: string
  spaceSlug: string
  baseUrl: string
}): EmailPayload {
  const step = STEPS[parts.day][parts.focus]
  const greeting = parts.greetingName ? `Hi ${parts.greetingName},` : 'Hi,'
  // The Crew requirement is stated once, on the first email, from the one pricing line.
  const lines = parts.day === 0 ? [...step.lines, PLAN_STORY.crewSpace] : step.lines
  const href = step.path === 'manage' ? `${parts.baseUrl}/spaces/${parts.spaceSlug}/manage` : `${parts.baseUrl}/spaces/${parts.spaceSlug}`
  const why = `You are receiving this because you run ${parts.spaceName} on Frequency.`
  const html = emailShell(
    [
      `<p style="${EMAIL_P}color:${palette.text};">${escapeHtml(greeting)}</p>`,
      ...lines.map((p) => `<p style="${EMAIL_P}color:${palette.text};">${escapeHtml(p)}</p>`),
      emailButton(step.cta, href),
    ].join('\n'),
    { text: escapeHtml(why), unsubscribe: true },
  )
  const text = `${greeting}\n\n${lines.join('\n\n')}\n\n${step.cta}: ${href}\n\n${why}\n`
  return { to: parts.to, subject: step.subject, html, text }
}
