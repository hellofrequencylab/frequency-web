// Lead flows — the assignable top-of-funnel (ADR-125, docs/LEAD-FLOWS.md).
//
// A lead flow is a named, shareable surface you drop behind ANY entry point — a QR
// at an event, an Instagram bio link, a partner's website button, a city landing
// page. Its one job: identify WHO the visitor is (a persona), record the lead, and
// route them to the right marketing track (or straight into the beta induction
// carrying their persona). It generalizes today's beta "sequences": a sequence
// skinned the induction by which link you clicked; a lead flow asks the visitor to
// tell us instead, so the same flow serves everyone and the signal is real.
//
// Code-first for now (type-safe, reviewed in PRs). A DB-backed, operator-assignable
// layer can override these later without changing callers — the vera_config pattern
// (ADR-125 picks code-first now, DB layer later). Client-safe (no server imports).

import { PERSONA_ORDER, type PersonaId } from '@/lib/onboarding/personas'

export interface LeadFlowSplash {
  eyebrow: string
  headline: string
  /** Sub-headline under the hero. */
  body: string
  /** Full-bleed hero image (public/ path). */
  image: string
  imageAlt: string
  /** Prompt above the persona picker. */
  prompt: string
}

export interface LeadFlow {
  slug: string
  /** Human label for admin + analytics. */
  label: string
  splash: LeadFlowSplash
  /** Which personas to surface, in order. Defaults to all five. */
  personas: PersonaId[]
  /** Pre-highlight a persona (e.g. a partner-targeted QR opens on "Partner business"). */
  defaultPersona?: PersonaId
  /** Ask for an email before routing on — records a nurture lead even if they bounce
   *  before signup. `false` = a pure router into the induction (the induction's own
   *  deferred flow collects sign-in at the end). */
  captureEmail: boolean
  /** Attribution source stamped on the lead + carried into the induction. */
  source: string
}

// ── The general welcome router — the default lead flow, lives at /start. ──────
const WELCOME: LeadFlow = {
  slug: 'welcome',
  label: 'Welcome (general router)',
  splash: {
    eyebrow: 'Welcome to Frequency',
    headline: 'Let’s get you to the right place.',
    body: 'Frequency turns the people near you into real community. First, tell us who you are — we’ll show you exactly what’s in it for you.',
    image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
    imageAlt: 'A Frequency community dancing together outdoors at golden hour, arms raised',
    prompt: 'Which sounds most like you?',
  },
  personas: PERSONA_ORDER,
  captureEmail: false,
  source: 'lead_welcome',
}

// ── In-person QR — "you met us at an event / in the wild." ────────────────────
const EVENT: LeadFlow = {
  slug: 'event',
  label: 'Event / in-person QR',
  splash: {
    eyebrow: 'Good to meet you in person',
    headline: 'You found us in the wild.',
    body: 'Glad you’re here. Tell us who you are and we’ll point you at the part of Frequency that’s actually for you.',
    image: '/images/site/community-1.jpg',
    imageAlt: 'A small group of friends gathered close together, talking and laughing',
    prompt: 'Which sounds most like you?',
  },
  personas: PERSONA_ORDER,
  captureEmail: true,
  source: 'lead_event',
}

// ── Partner-targeted — opens pre-focused on the business track. ───────────────
const PARTNER: LeadFlow = {
  slug: 'partner',
  label: 'Local business outreach',
  splash: {
    eyebrow: 'For local businesses',
    headline: 'Make your place the place.',
    body: 'Frequency sends real community through your doors — loyalty rewards, gamified foot traffic, and discovery by everyone gathering nearby.',
    image: '/images/site/lab-concept.jpg',
    imageAlt: 'A bright, welcoming community space designed for people to gather and build together',
    prompt: 'Tell us who you are so we tailor it:',
  },
  personas: PERSONA_ORDER,
  defaultPersona: 'partner',
  captureEmail: true,
  source: 'lead_partner',
}

export const LEAD_FLOWS: Record<string, LeadFlow> = {
  welcome: WELCOME,
  event: EVENT,
  partner: PARTNER,
}

export const DEFAULT_LEAD_FLOW = 'welcome'

/** Resolve a lead flow by slug, falling back to the default welcome router. */
export function getLeadFlow(slug: string | null | undefined): LeadFlow {
  return (slug && LEAD_FLOWS[slug]) || LEAD_FLOWS[DEFAULT_LEAD_FLOW]
}

export function listLeadFlows(): LeadFlow[] {
  return Object.values(LEAD_FLOWS)
}
