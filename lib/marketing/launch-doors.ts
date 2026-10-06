// THE FIVE LAUNCH DOORS (LIVE-800, ADR-1720 workstream 5). One registry for the five funnels'
// public doors: each door has one promise, one button that lands on the funnel's first win, and its
// own utm_campaign. A campaign link is `/go/<slug>?utm_source=…&utm_medium=…&utm_campaign=<utmCampaign>`;
// the proxy's first-touch cookie (lib/attribution/first-touch.ts) records the campaign on arrival and
// lib/funnels/next-step.ts reads it to pick each completion screen's next step.
//
// Pure data, client-safe. The lead archetypes are here for the people writing campaigns; they are
// never rendered and never sent to analytics or a pixel (ADR-1720, LIVE-810).
//
// Copy rules: no prices or percentages, no em dashes, no hype words, no health claims
// (docs/CONTENT-VOICE.md).

export interface LaunchDoor {
  /** The door's path segment, /go/<slug>. Also its utm_campaign. */
  slug: string
  /** The funnel's name, as the brief names it. */
  name: string
  /** The one promise, the page heading. */
  promise: string
  /** One supporting line under the promise. */
  detail: string
  /** The one button. */
  buttonLabel: string
  /** Where the button lands: the funnel's first win. A safe in-app path. */
  buttonHref: string
  /** The campaign every link to this door carries. */
  utmCampaign: string
  /** Who the campaigns for this door are written for (internal only, never rendered). */
  leadArchetypes: readonly string[]
}

export const LAUNCH_DOORS: readonly LaunchDoor[] = [
  {
    slug: 'calm-down-fast',
    name: 'Calm down fast',
    promise: 'Five quiet minutes, right now.',
    detail: 'Follow the rings, breathe in and let go. No account, nothing to install.',
    buttonLabel: 'Start 5 minutes',
    buttonHref: '/mindless',
    utmCampaign: 'calm-down-fast',
    leadArchetypes: ['Wired Professional', 'Evidence-First Skeptic'],
  },
  {
    slug: 'find-your-people',
    name: 'Find your people',
    promise: 'Something real to show up to this week.',
    detail: 'Gatherings near you this week, hosted by locals. Pick one and go.',
    buttonLabel: "See this week's Events",
    buttonHref: '/events',
    utmCampaign: 'find-your-people',
    leadArchetypes: ['Transplant', 'Activity-First Man'],
  },
  {
    slug: 'host-one-circle',
    name: 'Host one Circle',
    promise: 'Start the group you wish existed.',
    detail: 'Pick a Starter Circle, make it yours, and host the first gathering with three people.',
    buttonLabel: 'Remix a Starter Circle',
    buttonHref: '/circles/templates',
    utmCampaign: 'host-one-circle',
    leadArchetypes: ['Host-Connector', 'Gathering Host'],
  },
  {
    slug: 'bring-your-practice',
    name: 'Bring your practice',
    promise: 'Put your practice where local people can find it.',
    detail: 'Open a Space, add one service or Event, and take your first booking.',
    buttonLabel: 'Open your Space',
    buttonHref: '/spaces/new?mode=business:appointments',
    utmCampaign: 'bring-your-practice',
    leadArchetypes: ['Portfolio Teacher', 'Second-Act Practitioner'],
  },
  {
    slug: 'run-it-together',
    name: 'Run it together',
    promise: 'Run your place with the people you already work with.',
    detail: 'Set up a Business Space and connect your first Collaborator.',
    buttonLabel: 'Set up your Space',
    buttonHref: '/spaces/new?mode=business:membership',
    utmCampaign: 'run-it-together',
    leadArchetypes: ['Studio Keeper', 'Network Steward'],
  },
]

export function launchDoorBySlug(slug: string): LaunchDoor | undefined {
  return LAUNCH_DOORS.find((d) => d.slug === slug)
}
