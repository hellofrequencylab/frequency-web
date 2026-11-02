import type { ServicesKitNiche } from './services-variants'

interface ServicesKitSummary { id: string; niche: ServicesKitNiche; theme: 'Services'; label: string; description: string }

/** The Services Theme Kit's seven kits for the editor's kit library (the General template and the six niche doors), `services-<niche>`.
 *  Kept apart from services-variants.ts so listing them does not load the kits' copy, and apart from KIT_INDEX until the theme is
 *  registered (LIVE-2040). services-variants.test.ts pins every row to its kit. */
export const SERVICES_KIT_INDEX: readonly ServicesKitSummary[] = [
  { id: 'services-general', niche: 'general', theme: 'Services', label: 'Your place', description: 'A page for whatever you run: what happens here, who it is for and a way to come along.' },
  { id: 'services-coaches', niche: 'coaches', theme: 'Services', label: 'Coaches', description: 'Groups with a coach in each, a calendar people can book from and a first session that is free.' },
  { id: 'services-studios', niche: 'studios', theme: 'Services', label: 'Studios', description: 'Small classes, a schedule people book from and memberships that pause when life does.' },
  { id: 'services-hosts', niche: 'hosts', theme: 'Services', label: 'Hosts', description: 'A table, a date and seats people can save: menus, dates, a waitlist and a first supper that feels easy.' },
  { id: 'services-venues', niche: 'venues', theme: 'Services', label: 'Venues', description: 'The room, what is on this week and tickets people can buy before the doors open.' },
  { id: 'services-nonprofits', niche: 'nonprofits', theme: 'Services', label: 'Non-profits', description: 'The work explained plainly, crews to join, a calendar the neighbourhood reads and an easy way to give.' },
  { id: 'services-networks', niche: 'networks', theme: 'Services', label: 'Networks', description: 'Many groups under one roof: find yours, start one and see what is on everywhere.' },
]
