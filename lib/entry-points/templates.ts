// Entry-point templates — the predefined, goal-typed recipes (ADR-126,
// docs/ENTRY-POINTS.md). Each template is what a crew member picks: it sets a
// default destination, a flyer layout, a QR style preset, and the slot copy. The
// crew never sees a blank canvas — they fill a few slots in one of these.
//
// Code-first (the lib/onboarding/lead-flows.ts pattern); a DB-override layer can come
// later without changing callers. Client-safe: no server imports (the builder UI and
// the flyer composer both read this).

import type { FlyerLayout } from './flyer'

export type EntryTemplateId = 'event' | 'circle' | 'invite' | 'waitlist' | 'partner'

/** The kind of destination a template points at — drives the builder's picker. */
export type DestinationKind = 'lead_flow' | 'place' | 'custom'

export interface EntryTemplate {
  id: EntryTemplateId
  label: string
  /** One-line "what this is for" shown under the template card. */
  blurb: string
  emoji: string
  /** What the destination picker offers for this template. */
  destinationKind: DestinationKind
  /** Default destination path (a /start lead flow, or a place/url). Editable. */
  defaultDestination: string
  /** Flyer layout key (lib/entry-points/flyer-layout.ts). */
  flyerLayout: FlyerLayout
  /** QR style preset key (lib/qr/style.ts STYLE_PRESETS). */
  stylePreset: string
  /** Default flyer slot copy — the starting point a crew member edits. */
  slots: { headline: string; subhead: string; footer: string }
}

export const ENTRY_TEMPLATES: Record<EntryTemplateId, EntryTemplate> = {
  // ── Fill a local gathering — point at the in-person lead flow (persona-routed). ──
  event: {
    id: 'event',
    label: 'Event flyer',
    blurb: 'A poster for a local event. Scan to RSVP and join.',
    emoji: '📅',
    destinationKind: 'lead_flow',
    defaultDestination: '/start/event',
    flyerLayout: 'poster',
    stylePreset: 'sunset',
    slots: {
      headline: 'You’re invited',
      subhead: 'Add the date, place, and a line about it.',
      footer: 'Scan to join us',
    },
  },
  // ── Grow a circle — point at a circle the member is in (or the welcome flow). ──
  circle: {
    id: 'circle',
    label: 'Circle invite',
    blurb: 'Grow a circle you’re part of. Scan to find your people.',
    emoji: '⭕',
    destinationKind: 'place',
    defaultDestination: '/start/welcome',
    flyerLayout: 'card',
    stylePreset: 'forest',
    slots: {
      headline: 'Find your people',
      subhead: 'A small group near you, around what you love.',
      footer: 'Scan to join',
    },
  },
  // ── Personal invite — your own door into Frequency. ──
  invite: {
    id: 'invite',
    label: 'Personal invite',
    blurb: 'Your personal “come join me”. Scan to sign up.',
    emoji: '🤝',
    destinationKind: 'lead_flow',
    defaultDestination: '/start/welcome',
    flyerLayout: 'card',
    stylePreset: 'ocean',
    slots: {
      headline: 'Come join me on Frequency',
      subhead: 'Real community with the people near you.',
      footer: 'Scan to join',
    },
  },
  // ── Capture leads — point at a lead flow that records + routes. ──
  waitlist: {
    id: 'waitlist',
    label: 'Waitlist / sign-ups',
    blurb: 'Collect interest. Scan to get on the list.',
    emoji: '✉️',
    destinationKind: 'lead_flow',
    defaultDestination: '/start/welcome',
    flyerLayout: 'poster',
    stylePreset: 'midnight',
    slots: {
      headline: 'Be one of the first',
      subhead: 'We’re opening Frequency to a few people at a time.',
      footer: 'Scan to get on the list',
    },
  },
  // ── Local business — the partner track (persona-routed). ──
  partner: {
    id: 'partner',
    label: 'Local business',
    blurb: 'For a local spot. Scan to explore partnering.',
    emoji: '🏪',
    destinationKind: 'lead_flow',
    defaultDestination: '/start/partner',
    flyerLayout: 'card',
    stylePreset: 'gold',
    slots: {
      headline: 'Make your place the place',
      subhead: 'Loyalty rewards and real foot traffic from the community.',
      footer: 'Scan to learn more',
    },
  },
}

export const ENTRY_TEMPLATE_ORDER: EntryTemplateId[] = ['event', 'circle', 'invite', 'waitlist', 'partner']

export function isEntryTemplateId(value: string | null | undefined): value is EntryTemplateId {
  return !!value && value in ENTRY_TEMPLATES
}

/** Resolve a template by id, falling back to the event flyer. */
export function getEntryTemplate(id: string | null | undefined): EntryTemplate {
  return isEntryTemplateId(id) ? ENTRY_TEMPLATES[id] : ENTRY_TEMPLATES.event
}

export function listEntryTemplates(): EntryTemplate[] {
  return ENTRY_TEMPLATE_ORDER.map((id) => ENTRY_TEMPLATES[id])
}
