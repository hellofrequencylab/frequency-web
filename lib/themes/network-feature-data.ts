// Network Theme Kit data for the /themes/network feature page. Read from the Network design system
// (ui_kits/site/kits.js, Theme Feature Page.html) into network-feature-data.json, trimmed to what the page reads
// (JSON because each profile's accent is colour data, the way Nocturne's is). The pictures are renders of the kit's
// own surfaces, stored under public/themes/network-kit: the thirteen profile websites and Spotlights through the real
// chrome and blocks, one Space page and the email templates through the real Space page and mailer (a profile's email
// is the one in its accent family). The id of each profile equals the Wizard niche (lib/theme/mega-theme.ts).
import data from './network-feature-data.json'

export interface NetworkKit {
  id: string
  name: string
  hex: string
  who: string
  /** The accent family the profile's email is rendered in. */
  mail: string
  /** The tools the kit starts with (ids of NETWORK_TOOLS). */
  tools: string[]
  /** The home blocks the kit turns on (ids of NETWORK_BLOCKS). */
  blocks: string[]
  /** The layout variant the kit names for a block. */
  blockLayouts: Partial<Record<string, string>>
  fonts: { display: string; label: string }
  look: { corners: string; spacing: string; header: string; footer: string }
  hero: { title: string; em: string }
}
interface NetworkLayout {
  id: string
  name: string
  sub: string
}

/** The four surfaces a preview can show, in the order the design shows them. `shot` names the picture. */
export type NetworkSurface = 'site' | 'spotlight' | 'space' | 'email'
export type NetworkShot = 'site' | 'spot' | 'space' | 'spacephone' | 'email'
export const NETWORK_SURFACES: readonly { id: NetworkSurface; label: string; qual?: string; shot: NetworkShot; width: number; height: number }[] = [
  { id: 'site', label: 'Website', shot: 'site', width: 1280, height: 800 },
  { id: 'space', label: 'Space', qual: 'Profile', shot: 'space', width: 1264, height: 790 },
  { id: 'spotlight', label: 'Spotlight', qual: 'Link Page', shot: 'spot', width: 740, height: 1648 },
  { id: 'email', label: 'Email template', shot: 'email', width: 600, height: 1446 },
]

export const NETWORK_KITS: NetworkKit[] = data.kits
export const NETWORK_LAYOUTS: NetworkLayout[] = data.layouts
/** The four accent families (the scheme each profile's hero colour belongs to). */
export const NETWORK_ACCENTS: { id: string; hex: string }[] = data.accents

/** The four email templates. The note is rendered for every profile (in its accent family); the others are
 *  rendered once, in the first family. */
export const NETWORK_MAIL_TYPES = [
  { id: 'note', label: 'The note' },
  { id: 'welcome', label: 'Welcome' },
  { id: 'dates', label: 'The dates' },
  { id: 'receipt', label: 'Receipt' },
] as const
export type NetworkMailType = (typeof NETWORK_MAIL_TYPES)[number]['id']

export const networkKit = (id: string): NetworkKit => NETWORK_KITS.find((k) => k.id === id) ?? NETWORK_KITS[0]

/** A profile's picture of one surface. The Space page is the same for every profile (one render, one on a phone). */
export function networkShot(kit: string, shot: NetworkShot | string, mail: NetworkMailType = 'note'): string {
  if (shot === 'space') return '/themes/network-kit/shots/space.jpg'
  if (shot === 'spacephone') return '/themes/network-kit/shots/space-phone.jpg'
  if (shot === 'email') return mail === 'note' ? `/themes/network-kit/shots/email-${networkKit(kit).mail}-note.jpg` : `/themes/network-kit/shots/email-${mail}.jpg`
  return `/themes/network-kit/shots/${kit}-${shot}.jpg`
}
export const networkLayoutShot = (id: string): string => `/themes/network-kit/layouts/${id}.jpg`

/** The tools a kit starts with (Inside the kit). */
export const NETWORK_TOOLS: readonly { id: string; name: string; stage: string; blurb: string }[] = [
  { id: 'publish', name: 'Library & newsletter', stage: 'Attract · Capture · Nurture', blurb: 'Guides, recordings, member stories and your newsletter. Every site has this.' },
  { id: 'book', name: 'One-to-ones', stage: 'Convert · Deliver', blurb: 'Intro calls, mentor sessions and passes with four-step booking and reminders.' },
  { id: 'gather', name: 'Meetups', stage: 'Deliver · Keep', blurb: 'Recurring meetups and dated events with RSVPs, tickets, check-in and waitlists.' },
  { id: 'learn', name: 'Programs', stage: 'Nurture · Deliver', blurb: 'Groups, host training and onboarding with a landing page, player and progress.' },
  { id: 'belong', name: 'Membership', stage: 'Keep', blurb: 'Three tiers, yearly pricing, the member directory and pause.' },
  { id: 'sell', name: 'Shop', stage: 'Convert · Return', blurb: 'Tickets, host kits, downloads, gift memberships, bag and checkout.' },
]

/** The pages of a kit: name, what it does, and the tool it needs ('core' is always on). */
export const NETWORK_PAGES: readonly [name: string, text: string, tool: string][] = [
  ['Home', 'Hero, ways in, proof and a closing call. Blocks switch on with the kit’s tools.', 'core'],
  ['Offerings', 'Every service with length, price and a book button. Pulls from your booking tool.', 'book'],
  ['Book', 'Pick a time, answer intake, pay a deposit. Confirmation lands in the inbox.', 'book'],
  ['Gatherings', 'Dated events with seats, tickets and waitlists, as a list or a calendar.', 'gather'],
  ['Journeys', 'Programs for a group, with a start date, an outline and one promised result.', 'learn'],
  ['Shop', 'Products, downloads and gift cards with checkout on your domain.', 'sell'],
  ['Membership', 'Up to three tiers, yearly pricing, pause and resume.', 'belong'],
  ['Library', 'Guides and posts, free or paid, with the letter sign-up beside them.', 'publish'],
  ['About', 'Who you are, in your words, with the same face and accent as everywhere else.', 'core'],
]

/** The home blocks, in the design's order: id, name, tool ('core' needs none) and the stage of the offer ladder. */
export const NETWORK_BLOCKS: readonly [id: string, name: string, tool: string, stage: string][] = [
  ['hero', 'Hero', 'core', 'Attract'],
  ['live', 'Next meetup strip', 'core', 'Convert'],
  ['steps', 'How it works', 'core', 'Convert'],
  ['doors', 'Ways in', 'core', 'Convert'],
  ['offerings', 'Offerings', 'book', 'Convert'],
  ['journeys', 'Programs', 'learn', 'Deliver'],
  ['gatherings', 'Meetups', 'gather', 'Deliver'],
  ['membership', 'Membership', 'belong', 'Keep'],
  ['proof', 'Proof', 'core', 'Return'],
  ['shop', 'Shop', 'sell', 'Convert'],
  ['library', 'From the library', 'publish', 'Attract'],
  ['letter', 'Newsletter sign-up', 'publish', 'Capture'],
  ['faq', 'Questions', 'core', 'Convert'],
  ['featured', 'Featured event', 'gather', 'Convert'],
  ['venue', 'Where and when', 'core', 'Convert'],
  ['calendar', 'Events calendar', 'gather', 'Deliver'],
  ['chapters', 'Chapters', 'belong', 'Keep'],
  ['circles', 'Circles', 'belong', 'Keep'],
  ['stats', 'Stats', 'core', 'Return'],
  ['note', 'Organizer note', 'core', 'Return'],
  ['pillars', 'What we stand for', 'core', 'Return'],
  ['rooms', 'Host here', 'core', 'Convert'],
  ['podcast', 'Podcast', 'publish', 'Attract'],
  ['social', 'Instagram', 'publish', 'Attract'],
  ['merch', 'Shop strip', 'sell', 'Convert'],
  ['contact', 'Coffee and contact', 'core', 'Convert'],
  ['cta', 'Closing call', 'core', 'Convert'],
]

/** The four email templates as Inside the kit lists them: name, when it goes, what it says. */
export const NETWORK_EMAILS: readonly [name: string, when: string, text: string][] = [
  ['The note', 'When you send', 'What is on next, one offer, a word from someone.'],
  ['Welcome', 'On sign-up', 'What to expect and three ways in.'],
  ['The dates', 'Before the month', 'Everything on the calendar, pulled from your events.'],
  ['The receipt', 'After booking', 'When, where and what was paid.'],
]

export const NETWORK_DISPLAY_FACES = ['Kit default', 'Instrument Serif', 'Bricolage', 'DM Serif'] as const
export const NETWORK_CORNERS = ['Kit default', 'Sharp', 'Soft', 'Round'] as const

/** Start a Space on this kit: Create a Space reads the niche and the theme. */
export const networkStartHref = (kit: string): string => `/spaces/new?niche=${kit}&theme=network-kit`
