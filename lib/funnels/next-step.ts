// Funnel next step (LIVE-801, ADR-1720). The launch brief: "Every completion screen shows one
// next step, chosen by the funnel the person came in through, and each step moves them closer to
// a room with other people." This is the ONE rule for that choice, so every completion screen
// (the Mindless reveal, an RSVP confirmation, a Circle publish) agrees on it.
//
// Pure and client-safe: string checks only. The inputs are the first-touch campaign (the fq_attr
// cookie, lib/attribution/first-touch.ts) and the induction persona (the fq_persona cookie). The
// result is a link, never an analytics event: no funnel, persona or archetype leaves the browser
// from here (LIVE-810).

/** The five launch funnels, keyed by the door a person came in through. */
export type LaunchFunnel = 'calm' | 'people' | 'host' | 'practice' | 'together'

/** The completion screens that show a next step. */
export type CompletionMoment = 'mindless' | 'rsvp' | 'circle'

export interface NextStep {
  label: string
  href: string
  /** One short line under the label: why this step, in plain words. */
  body: string
}

/** Door slug (also the door's utm_campaign) to funnel. LIVE-800 builds the doors on these slugs. */
export const DOOR_FUNNELS: Readonly<Record<string, LaunchFunnel>> = {
  'calm-down-fast': 'calm',
  'find-your-people': 'people',
  'host-one-circle': 'host',
  'bring-your-practice': 'practice',
  'run-it-together': 'together',
}

/** Induction persona to funnel, used only when no door campaign is on record. */
const PERSONA_FUNNELS: Readonly<Record<string, LaunchFunnel>> = {
  practitioner: 'practice',
  partner: 'together',
  builder: 'host',
}

/** Funnels that bring people in as Members (the Mission Patron can arrive through any of them). */
const MEMBER_FUNNELS: readonly LaunchFunnel[] = ['calm', 'people', 'host']

/**
 * Which funnel a person came in through: the door campaign wins, then the induction persona,
 * then Find your people, the default door to a room with other people. Matching is on the
 * door slug anywhere in the campaign, so `calm-down-fast-oct` still counts.
 */
export function funnelFrom(input: { campaign?: string | null; persona?: string | null }): LaunchFunnel {
  const campaign = (input.campaign ?? '').toLowerCase()
  if (campaign) {
    for (const [slug, funnel] of Object.entries(DOOR_FUNNELS)) {
      if (campaign.includes(slug)) return funnel
    }
  }
  const persona = (input.persona ?? '').toLowerCase()
  if (persona && PERSONA_FUNNELS[persona]) return PERSONA_FUNNELS[persona]
  return 'people'
}

const CREW: NextStep = {
  label: 'Join Crew',
  href: '/upgrade',
  body: 'Crew is how regulars keep the rooms going. Come to more of them.',
}

/**
 * The one next step for a funnel at a completion moment. Every step points toward a gathering.
 * `circleHref` is the Circle just published, for the "invite people" step.
 * `patron` marks a Mission Patron, who lands on Crew from any member funnel.
 */
export function nextStepFor(
  funnel: LaunchFunnel,
  moment: CompletionMoment,
  opts: { circleHref?: string; patron?: boolean } = {},
): NextStep {
  if (opts.patron && MEMBER_FUNNELS.includes(funnel) && moment !== 'circle') return CREW

  if (moment === 'circle') {
    if (funnel === 'practice') {
      return {
        label: 'Put your practice in a free Space',
        href: '/spaces/new',
        body: 'Your Circle can meet there, and people can book you.',
      }
    }
    if (funnel === 'together') {
      return {
        label: 'Set up a Space with a Collaborator',
        href: '/spaces/new',
        body: 'Run the Circle together, with both of you on the door.',
      }
    }
    return {
      label: 'Invite three people to the first gathering',
      href: opts.circleHref ?? '/circles',
      body: 'Three in the room makes it a Circle. Send them the link.',
    }
  }

  switch (funnel) {
    case 'calm':
      return moment === 'mindless'
        ? { label: 'Find a calm gathering this week', href: '/events', body: 'Same quiet, with people around you.' }
        : { label: 'See what else is on this week', href: '/events', body: 'One more on the calendar makes it a habit.' }
    case 'host':
      return {
        label: 'Remix a Starter Circle',
        href: '/circles/starter',
        body: 'Pick one, make it yours, and host the first gathering.',
      }
    case 'practice':
      return {
        label: 'Open a free Space for your practice',
        href: '/spaces/new',
        body: 'Add one service or Event, and people can book you.',
      }
    case 'together':
      return {
        label: 'Set up a Space with a Collaborator',
        href: '/spaces/new',
        body: 'Bring the people you already run things with.',
      }
    case 'people':
    default:
      return moment === 'mindless'
        ? { label: "See this week's Events", href: '/events', body: 'Find something near you and say you are going.' }
        : { label: 'Find a Circle that meets every week', href: '/circles', body: 'The same faces, week after week.' }
  }
}
