// The operator lifecycle emails (LIVE-1141): what a new Space owner hears from Frequency on day 1, 3 and 7. PURE, so the
// stock catalog and the tests render them with fixtures. One sequence, four short variants keyed by what the Space runs
// (its mode variant), because that is the one thing we know for certain; the six doors fold into those four. The Crew
// line is PLAN_STORY.crewSpace, stated once, on day 1. Account-adjacent guidance, so the standard footer and its
// unsubscribe control stay; the cron gates every send through the lifecycle send gate.
import { emailButton, emailShell, EMAIL_P, escapeHtml, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'
import { PLAN_STORY } from '@/lib/pricing/plan-story'

export type OperatorDay = 1 | 3 | 7
export const OPERATOR_DAYS: readonly OperatorDay[] = [1, 3, 7]

export type OperatorFocus = 'packages' | 'membership' | 'ticketed' | 'donations' | 'general'

/** What a Space runs, from its type and Focus. Anything unknown reads as general. */
export function operatorFocus(type: string | null | undefined, variant: string | null | undefined): OperatorFocus {
  if (type === 'nonprofit') return 'donations'
  if (variant === 'packages' || variant === 'appointments' || variant === 'cohort' || variant === 'service') return 'packages'
  if (variant === 'membership') return 'membership'
  if (variant === 'ticketed') return 'ticketed'
  if (variant === 'donations' || variant === 'programs') return 'donations'
  return 'general'
}

type Step = { subject: string; lines: string[]; cta: string; path: 'public' | 'manage' }

const DAY_1: Record<OperatorFocus, Step> = {
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
  general: {
    subject: 'Your Space is open. Here is the first step.',
    lines: ['Your page is live. Start by adding what you offer, with a date or a price, so the first visitor knows what to do.'],
    cta: 'Open your Space',
    path: 'manage',
  },
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
  general: {
    subject: 'A week in. See what happened.',
    lines: ['Open your Space and look at who visited and what they did. Change one thing, then share your link again.'],
    cta: 'Open your Space',
    path: 'manage',
  },
}

const STEPS: Record<OperatorDay, Record<OperatorFocus, Step>> = { 1: DAY_1, 3: DAY_3, 7: DAY_7 }

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
  const lines = parts.day === 1 ? [...step.lines, PLAN_STORY.crewSpace] : step.lines
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
