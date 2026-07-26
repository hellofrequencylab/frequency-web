// THE EVENT MANAGE HUB sections. The event Manage dashboard is a category-navigated hub,
// mirroring the Space /manage console (space-hub.ts): one master page, a pill sub-menu, and
// `?section=` in the URL so every area is server-rendered + shareable. This is a PURE,
// route-local grouping of the dashboard's own body sections. It is NOT a module catalog and
// declares none (MENU-CONTRACT/ADR-553 stays intact): the event's admin MODULES still live in
// ADMIN_MODULES, and this hub only arranges the bespoke dashboard the contract already carves
// out for events. Framework-free (data only), so it is trivially unit-testable.

/** A hub tab id. `home` is the command-center landing: the stat strip + the message center. */
export type EventHubSection = 'home' | 'guests' | 'questions' | 'tickets' | 'updates' | 'settings'

/** The hub tabs, in display order. Home leads (stats + the message center, the owner directive:
 *  messaging sits up front). `tickets` only renders while ticketing is enabled (the page filters). */
export const EVENT_HUB_SECTIONS: readonly {
  key: EventHubSection
  label: string
  blurb: string
}[] = [
  {
    key: 'home',
    label: 'Home',
    blurb: 'Your command center: the numbers at a glance, and a direct line to every attendee.',
  },
  {
    key: 'guests',
    label: 'Guests',
    blurb: 'Who is coming: RSVPs, captured guests, the approval queue, and who to follow up with.',
  },
  {
    key: 'questions',
    label: 'Questions',
    blurb: 'What you ask guests when they RSVP, and every answer, ready to export.',
  },
  {
    key: 'tickets',
    label: 'Tickets',
    blurb: 'Named tiers with fixed, free, pay-what-you-can, sliding-scale, or donation pricing.',
  },
  {
    key: 'updates',
    label: 'Updates',
    blurb: 'The updates you have posted and sent as Dispatches.',
  },
  {
    key: 'settings',
    label: 'Settings',
    blurb: 'The whole event, edited in place: images, title, time, location, and visibility.',
  },
]

/** The default landing tab. */
export const DEFAULT_EVENT_HUB_SECTION: EventHubSection = 'home'

/** Narrow an arbitrary `?section=` value to a known hub tab, defaulting to Home. PURE. */
export function asEventHubSection(raw: string | null | undefined): EventHubSection {
  return EVENT_HUB_SECTIONS.some((s) => s.key === raw) ? (raw as EventHubSection) : DEFAULT_EVENT_HUB_SECTION
}
