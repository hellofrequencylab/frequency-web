// Application tracks — WHO is applying and WHAT each flow asks (Growth OS Engine 3,
// GE3-2/GE3-3, ADR-456). An application track names a flow a builder or operator
// travels (apply-to-host, or a per-persona operator track), the plain questions it
// asks, and whether an accept hands off a Starter Circle + the host role.
//
// Code-first (the lib/onboarding/personas.ts + lib/funnels/templates.ts pattern):
// type-safe, reviewed in PRs, a DB-override layer can come later without changing
// callers. Client-safe (no server imports) so the apply UI + the review queue read it
// directly. Strings pass CONTENT-VOICE (plain, no em dashes, proper nouns carry the
// magic; never narrate the reader's feelings).

import type { PersonaId } from '@/lib/onboarding/personas'

/** The application tracks (mirrors the applications.track CHECK in the migration). */
export type ApplicationTrack =
  | 'host'
  | 'practitioner'
  | 'partner'
  | 'coach'
  | 'business'
  | 'nonprofit'
  | 'collective'

export const APPLICATION_TRACKS: ApplicationTrack[] = [
  'host',
  'practitioner',
  'partner',
  'coach',
  'business',
  'nonprofit',
  'collective',
]

/** The review lifecycle (mirrors applications.status). */
export type ApplicationStatus = 'pending' | 'in_review' | 'accepted' | 'declined' | 'withdrawn'

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'pending',
  'in_review',
  'accepted',
  'declined',
  'withdrawn',
]

/** The open (still-actionable) statuses, for the queue's default filter + the
 *  one-open-per-track guard. */
export const OPEN_STATUSES: ApplicationStatus[] = ['pending', 'in_review']

/** One plain question a track asks. `key` lands in applications.answers; `label` is
 *  the member-facing prompt; `hint` is an optional one-line helper. */
export interface ApplicationQuestion {
  key: string
  label: string
  hint?: string
  /** A short single-line answer vs a longer textarea. Defaults to long. */
  short?: boolean
  required?: boolean
}

/** One application track: its audience, the questions it asks, and its handoff. */
export interface ApplicationTrackDef {
  id: ApplicationTrack
  /** Operator-facing noun for the queue + analytics ("Apply to host"). */
  label: string
  /** One-line "who this is for" on the apply card + the queue row. */
  blurb: string
  /** The persona this track maps to (drives tags + analytics), or null. */
  persona: PersonaId | null
  /** Apply-to-host hands off a Starter Circle + the host role on accept. The operator
   *  tracks do not (they provision a Space, future work GE10), so this is false for them. */
  grantsHost: boolean
  /** The plain questions this track asks. */
  questions: ApplicationQuestion[]
}

// ── Apply to host (the builder track, GE3-2) ──────────────────────────────────
const HOST: ApplicationTrackDef = {
  id: 'host',
  label: 'Apply to host',
  blurb: 'For the people who want to bring others together. We hand you a format and back you up.',
  persona: 'builder',
  grantsHost: true,
  questions: [
    {
      key: 'why',
      label: 'Why do you want to host a Circle?',
      hint: 'A line or two. Plain is fine.',
      required: true,
    },
    {
      key: 'who',
      label: 'Who would you gather?',
      hint: 'The people you already know, or the ones you wish you did.',
    },
    {
      key: 'where',
      label: 'Where would you meet?',
      hint: 'A living room, a park, a coffee shop. Anywhere but a screen.',
      short: true,
    },
    {
      key: 'experience',
      label: 'Have you hosted anything before?',
      hint: 'A book club, a dinner, a team. It all counts. So does "no."',
    },
  ],
}

// ── Operator tracks (GE3-3) — per persona. None grants host; each provisions a
//    Space on accept (future GE10), so the review queue is the gate today. ───────
const PRACTITIONER: ApplicationTrackDef = {
  id: 'practitioner',
  label: 'Practitioner',
  blurb: 'For coaches, teachers, and guides who have something to offer and want a place to run it.',
  persona: 'practitioner',
  grantsHost: false,
  questions: [
    { key: 'offering', label: 'What do you offer?', hint: 'In plain words, what you do.', required: true },
    { key: 'who', label: 'Who is it for?' },
    { key: 'link', label: 'A link to your work', hint: 'A site, an Instagram, anything.', short: true },
  ],
}

const PARTNER: ApplicationTrackDef = {
  id: 'partner',
  label: 'Partner business',
  blurb: 'For a local business or venue that wants to host gatherings or back the community.',
  persona: 'partner',
  grantsHost: false,
  questions: [
    { key: 'business', label: 'What is the business?', short: true, required: true },
    { key: 'city', label: 'What city are you in?', short: true },
    { key: 'idea', label: 'How would you want to work together?' },
  ],
}

const COACH: ApplicationTrackDef = {
  id: 'coach',
  label: 'Coach',
  blurb: 'For coaches who want to run cohorts and a curriculum inside their own Space.',
  persona: 'practitioner',
  grantsHost: false,
  questions: [
    { key: 'practice', label: 'What do you coach?', required: true },
    { key: 'format', label: 'How do you run it today?', hint: '1:1, group, online, in person.' },
    { key: 'link', label: 'A link to your work', short: true },
  ],
}

const BUSINESS: ApplicationTrackDef = {
  id: 'business',
  label: 'Business',
  blurb: 'For a business that wants member tools: bookings, a CRM, and a place to gather people.',
  persona: 'partner',
  grantsHost: false,
  questions: [
    { key: 'business', label: 'What is the business?', short: true, required: true },
    { key: 'need', label: 'What are you trying to run?', hint: 'Bookings, a member list, events.' },
  ],
}

const NONPROFIT: ApplicationTrackDef = {
  id: 'nonprofit',
  label: 'Nonprofit',
  blurb: 'For a nonprofit running programs and recurring giving for the people it serves.',
  persona: 'partner',
  grantsHost: false,
  questions: [
    { key: 'org', label: 'What is the organization?', short: true, required: true },
    { key: 'mission', label: 'Who do you serve?' },
    { key: 'programs', label: 'What programs would you run here?' },
  ],
}

const COLLECTIVE: ApplicationTrackDef = {
  id: 'collective',
  label: 'Collective',
  blurb: 'For a group of guides or creators who want to run shared programming together.',
  persona: 'practitioner',
  grantsHost: false,
  questions: [
    { key: 'collective', label: 'Who is in the collective?', required: true },
    { key: 'idea', label: 'What would you run together?' },
  ],
}

export const APPLICATION_TRACK_DEFS: Record<ApplicationTrack, ApplicationTrackDef> = {
  host: HOST,
  practitioner: PRACTITIONER,
  partner: PARTNER,
  coach: COACH,
  business: BUSINESS,
  nonprofit: NONPROFIT,
  collective: COLLECTIVE,
}

/** Resolve a track def by id, or null for an unknown id. */
export function getTrack(id: string | null | undefined): ApplicationTrackDef | null {
  return id && (APPLICATION_TRACKS as string[]).includes(id) ? APPLICATION_TRACK_DEFS[id as ApplicationTrack] : null
}

/** Narrow an untyped string to an ApplicationTrack, or null. */
export function asTrack(v: string | null | undefined): ApplicationTrack | null {
  return v && (APPLICATION_TRACKS as string[]).includes(v) ? (v as ApplicationTrack) : null
}

/** Narrow an untyped string to an ApplicationStatus, or null. */
export function asStatus(v: string | null | undefined): ApplicationStatus | null {
  return v && (APPLICATION_STATUSES as string[]).includes(v) ? (v as ApplicationStatus) : null
}

/** Plain operator-facing label for a status (the queue chips). */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'New',
  in_review: 'In review',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}
