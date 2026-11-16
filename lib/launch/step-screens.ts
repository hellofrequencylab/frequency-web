// THE STEP SCREENS (SCAN-1211), the pure half. Seven of the nine launch steps have no builder of their own: each opens
// the real, working tool for that thing (the Space's offer page, the event form, the payments settings). A step screen is a
// short, calm page that says what the step is for and sends the person there, so every launch link (the box, the resume page,
// the "Next" button, the reminder emails) lands on a real page. A step is done when the real record exists, whoever made it
// (lib/launch/done-checks.ts), so these screens never claim a step; they only open the door. PURE.

import { inFlowHref } from './destination.ts'
import { REVIEW_HREF } from './review.ts'
import { launchStepHref, type LaunchStepId } from './steps.ts'

/** The steps that open a tool through a screen. Spotlight has its own builder, and Review and publish its own page. */
export type ScreenStepId = Exclude<LaunchStepId, 'spotlight'>

export interface StepScreenCopy {
  eyebrow: string
  title: string
  description: string
  /** The one button. */
  action: string
}

const SCREENS: Readonly<Record<ScreenStepId, StepScreenCopy>> = {
  space: {
    eyebrow: 'Your Space',
    title: 'Make your Space sound like you',
    description: 'Your tagline and your story sit at the top of your Space. We drafted them from your own words. Look them over, change anything, and keep them.',
    action: 'Review and publish',
  },
  offer: {
    eyebrow: 'First offer',
    title: 'Add your first offer',
    description: 'One thing people can say yes to: a class, a session, a product. We will open the page where you set it up.',
    action: 'Set up my offer',
  },
  website: {
    eyebrow: 'Website',
    title: 'Put your website live',
    description: 'Your website is built from your Space. Look it over, then switch it on. It is free, and you can change it any time.',
    action: 'Open my website',
  },
  event: {
    eyebrow: 'Event',
    title: 'Host your first event',
    description: 'A date on the calendar gives people a reason to show up. Pick a time and a place, and we will do the rest.',
    action: 'Start my event',
  },
  circle: {
    eyebrow: 'Circle',
    title: 'Start a Circle',
    description: 'A Circle is a small group that meets around something you care about. Start from a template or from scratch.',
    action: 'Start my Circle',
  },
  journey: {
    eyebrow: 'Journey',
    title: 'Plan a Journey',
    description: 'A Journey walks people through a program or a course, one step at a time. Plan yours when you are ready.',
    action: 'Plan my Journey',
  },
  people: {
    eyebrow: 'Your people',
    title: 'Bring your people in',
    description: 'Add the people you already know, or share a sign-up link. They are yours, and they stay in one place.',
    action: 'Open my people',
  },
  paid: {
    eyebrow: 'Get paid',
    title: 'Get ready to be paid',
    description: 'Connect your payouts so the money from your offers and events lands in your own account.',
    action: 'Set up payouts',
  },
}

/** The words for one step screen. */
export function stepScreen(id: ScreenStepId): StepScreenCopy {
  return SCREENS[id]
}

/** The step ids that have a screen. */
export const SCREEN_STEP_IDS = Object.keys(SCREENS) as ScreenStepId[]

/** Where a step's button goes: the real tool, for this person's Space. With no Space yet every step starts at the
 *  Spotlight, which makes it. Handles are encoded; nothing here reads a person's own words. */
export function stepDestination(id: ScreenStepId, space: { id: string; slug: string } | null): string {
  if (!space) return inFlowHref(launchStepHref('spotlight'))
  const slug = encodeURIComponent(space.slug)
  switch (id) {
    case 'space':
      return REVIEW_HREF
    case 'offer':
      return `/spaces/${slug}/manage/offer`
    case 'website':
      return `/spaces/${slug}/manage/layout`
    case 'event':
      return `/events/new?space=${encodeURIComponent(space.id)}`
    case 'circle':
      return '/circles/new'
    case 'journey':
      return `/journeys/new?space=${slug}`
    case 'people':
      return `/spaces/${slug}/crm`
    case 'paid':
      return `/spaces/${slug}/settings/payments`
  }
}
