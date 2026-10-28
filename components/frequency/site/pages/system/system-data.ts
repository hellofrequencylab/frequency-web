// /system copy (LIVE-1562): every word on the page in one file, so a copy sweep touches one place. PURE data.
// Voice: docs/marketing/voice-and-language-guide.md. Pain first, plain words, no em dashes, no invented numbers,
// no hard claims. Prices never live here; the page reads them from the pricing input. The time line stays
// "Plan on an afternoon" until a measured median exists (04-claude-code-handoff.md, time claim).
import { THEME_LIBRARY } from '@/lib/themes/library'

/** The h1 and lede live in frequency-system.tsx itself (lib/seo/frequency-pages.test.ts reads them there). */
export const SYSTEM_HERO = {
  eyebrow: 'Frequency, the whole system',
  trust: 'Month to month. Start free. No cut of your own sales, plus card processing.',
  who: 'Built for coaches, studios, hosts, venues, non profits, networks and every local business in between.',
} as const

/** The logins a Space replaces. The reader counts their own; the page never names a figure. */
export const SYSTEM_PAIN = {
  label: 'Where most people start',
  heading: "Right now it's six logins and a spreadsheet.",
  logins: ['Site builder', 'Link page', 'Ticket tool', 'Email tool', 'Payment link', 'Booking calendar', 'Notes app that is secretly your CRM'],
  body:
    'Every one holds a piece of your people. None of them know about each other. So the person who bought a ticket last month gets a "new here?" email, and Sunday night goes to copying names between tabs.',
  console: { title: 'One console', body: 'Your site, sign-ups, people, emails, events and payments. One list of people. One monthly price.' },
  caption: 'Count your own logins. That is the number we replace.',
} as const

export type ReachStatus = 'ready' | 'soon' | 'partial'

/** Design once: one theme, five surfaces. Readiness is read from the theme library, never typed here. */
export interface DesignOnceSurface {
  name: string
  carries: string
  /** How many of the seven themes dress this surface today, or 'all' for the Space page rule. */
  ready: string
}

const readyCount = (id: 'spotlight' | 'website' | 'email') =>
  THEME_LIBRARY.filter((t) => t.surfaces.find((s) => s.id === id)?.status === 'ready').length

export function designOnceSurfaces(): DesignOnceSurface[] {
  const total = THEME_LIBRARY.length
  const count = (n: number) => (n === total ? 'Ready on every theme' : n === 0 ? 'On the way' : `Ready on ${n} of ${total} themes`)
  return [
    { name: 'Your website', carries: 'Full theme', ready: count(readyCount('website')) },
    { name: 'Your Spotlight', carries: 'Full theme', ready: count(readyCount('spotlight')) },
    { name: 'Your emails', carries: 'Full theme', ready: count(readyCount('email')) },
    { name: 'Your sign-up page', carries: 'Full theme, it is a page on your website', ready: count(readyCount('website')) },
    { name: 'Your Space page', carries: 'Font and accent only', ready: 'Ready on every theme' },
  ]
}

export const SYSTEM_DESIGN_ONCE = {
  label: 'Design once',
  heading: 'Four things to design. One decision.',
  body: 'Pick a Theme Kit one time. The surfaces marked ready take it from there, and each kit page says which ones those are today.',
  source: { title: 'Your theme', body: 'Type, color, spacing, imagery. Chosen one time, when you set up your Space.' },
} as const

/** The hub: four front doors, one people list, six tools. Rendered as the inline diagram and as text. */
export const SYSTEM_HUB = {
  label: 'How it fits together',
  heading: 'Four front doors. One list of people. Everything else runs off it.',
  doors: [
    ['Your website', 'Your name, your look'],
    ['Spotlight', 'Your page, one link'],
    ['Space page', 'Where members join'],
    ['Sign-up page', 'One simple step in'],
  ],
  people: ['Your people', 'one list, one history', "who came, who's new"],
  tools: [
    ['Email', 'Same look as your site'],
    ['Events and tickets', 'On your site, with check-in'],
    ['Payments', 'One checkout, no cut of yours'],
    ['Circles', 'Where regulars meet'],
    ['Journeys', 'Teach over time'],
    ['Activity', 'See the week, adjust'],
  ],
} as const

/** One week, one person. A true sequence, so numbered. Each step names the part doing the work. */
export const SYSTEM_WEEK = {
  label: 'One week, one person',
  heading: "Maya finds you on Monday. By Sunday she's a regular.",
  steps: [
    { title: 'She sees your Spotlight', body: 'A friend shares your link. She lands on your page.', part: 'Spotlight' },
    { title: "She joins Thursday's gathering", body: "She signs up. She's now on your people list.", part: 'Sign-up and People' },
    { title: 'She gets a welcome email', body: "It looks like your website, because it's the same theme.", part: 'Email' },
    { title: 'She buys a ticket', body: 'One checkout. The money goes to you.', part: 'Payments' },
    { title: 'She shows up', body: 'You greet her at the door and know she came.', part: 'Check-in' },
    { title: 'She joins a Circle', body: 'She meets two people who were in the same room.', part: 'Circles' },
    { title: 'You see the week', body: "Who came, who's new, who went quiet. You plan the next one.", part: 'Activity' },
  ],
} as const

export const SYSTEM_WIZARD = {
  label: 'Guided setup',
  heading: 'Plan on an afternoon.',
  body: 'Setting up a Space asks one thing at a time and fills your kit with your answers as you go. Stop whenever. Come back and pick up where you left off.',
  steps: [
    { title: 'Who you are', body: "Your name, a line about what you do, who it's for." },
    { title: 'What you offer', body: 'A gathering, a class, a session, a membership. Start with one.' },
    { title: 'Your first gathering', body: 'A date, a place, a price or free.' },
    { title: 'Your look', body: 'Pick a Theme Kit. See it first.' },
    { title: 'Publish', body: 'Your site, your Space page and your sign-up page go live together.' },
  ],
} as const

export const SYSTEM_KIT = {
  label: 'The kit',
  heading: 'Pick a look. Press Publish.',
  body: 'Seven Theme Kits. Each one carries every surface and every tool. Pick the one that feels like you, turn on only what you need, and your words fill it in.',
  /** The three kits shown on the page, in order. The first is the front theme (owner, 2026-10-27). */
  featured: ['frequency', 'midnight', 'designer'] as const,
  more: { href: '/themes', label: 'Browse all seven Theme Kits' },
} as const

export const SYSTEM_INSIDE = {
  label: "What's inside",
  heading: "Grouped by what you're trying to do, not by module.",
  body: 'Every tool below is a switch. Start with one gathering and turn on the rest when you want them.',
} as const

/** What the theme touches, and what it never touches (the theme fence, ADR-1906). */
export const SYSTEM_REACH = {
  label: 'What the theme touches',
  heading: "The theme goes everywhere you're seen. Never where you work.",
  columns: ['Surface', 'What the kit does', 'Why'],
  rows: [
    ['Website and sign-up page', 'Full theme.', 'This is your brand, so it should be all yours.'],
    ['Email', 'Full theme, where marked ready.', 'A note should feel like your site.'],
    ['Spotlight', 'Full theme, where marked ready.', 'Your public page is part of your brand.'],
    ['Space page', 'Font and accent only.', 'It stays the Frequency member portal, so members always know where they are.'],
    ['Member area, console, admin', 'Never styled by a theme.', 'The place you run things stays steady.'],
  ],
} as const

/** Real Spaces, named with consent (owner 2026-10-27 19:09Z). Both are the owner's demo Spaces and say so. */
export const SYSTEM_OWNERS = {
  label: 'See it running',
  heading: 'Two demo Spaces, both live.',
  body: 'These are our own demo Spaces, so you can click through a whole kit before you pick one.',
  demos: [
    {
      name: 'House of Fates',
      kit: 'Nocturne',
      theme: 'midnight',
      line: 'A tarot and ritual practice on the Nocturne kit: website, bookings and a full menu.',
      href: 'https://house-of-fates.frequencylocal.com',
    },
    {
      name: 'Alli Rae Build and Design',
      kit: 'Designer',
      theme: 'designer',
      line: 'A design studio on the Designer kit: portfolio, services and a way to get in touch.',
      href: 'https://alliraebuilddesign.frequencylocal.com',
    },
  ],
  note: 'Demo Spaces. Both belong to Frequency.',
} as const

export const SYSTEM_PRICE = {
  label: 'What it costs',
  heading: 'One price. Month to month.',
} as const

export const SYSTEM_FAQ: readonly { q: string; a: string }[] = [
  { q: 'Will a theme change how my Space page looks to members?', a: 'No. It takes your font and accent, and stays the Frequency portal.' },
  { q: 'Do I need to be technical?', a: 'No. Setting up a Space is the setup. Pick a look, answer a few questions, press Publish.' },
  { q: 'Can I leave, and what comes with me?', a: 'Your contacts export any time, as a VCard or your whole list. Nothing you build here is locked in.' },
  { q: 'Can I turn things off?', a: 'Yes. Every tool is a switch. Start with one gathering and add the rest when you want them.' },
  { q: 'Can I change my mind about the theme?', a: 'Yes. Change theme in your editor swaps the look and keeps your words and pages.' },
]

export const SYSTEM_CLOSE = {
  title: 'Pick a look. Everything else is already wired.',
  body: 'Month to month. Start free. Plan on an afternoon.',
} as const
