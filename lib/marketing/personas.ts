// ── Per-Mode persona / package landing pages (Phase F2, Modes M5) ─────────────
// One small, typed registry of the persona pages ("Frequency for Coaches", "for
// Service Businesses", ...) plus a pure generator that turns a persona row into
// the page's copy, metadata, and JSON-LD inputs. Every persona page is a row
// here, not a hand-built file: the route reads this registry, so adding a persona
// is one entry, never a new page (mirrors lib/marketing/comparisons.ts).
//
// Each persona LEADS with that Mode's package focus: the lexicon (what it calls
// its people + its offerings) and the recommended add-ons come straight from the
// Mode registry (lib/spaces/modes.ts), and the recommended loadout + founding
// price come from the same CODE catalog the pricing page renders
// (lib/pricing/pricing-page.ts), so the persona figures never drift from the
// table. No DB, no per-request billing read: these are STATIC marketing pages.
//
// Voice + naming are locked (docs/CONTENT-VOICE §10, docs/NAMING): plain
// sentences, honest, the skeptic test, no em dashes, no health claims, we name
// what the product is and never knock an alternative.

import { resolveMode, type ModeProfile } from '@/lib/spaces/modes'
import type { SpaceType } from '@/lib/spaces/types'
import { spaceCreatePath, type FunnelDestination } from '@/lib/onboarding/beta-sequences'
import {
  PERSONA_LOADOUTS,
  PRICING_ADDONS,
  loadoutStripRow,
  stripTotalLabel,
  type LoadoutStripRow,
  type PersonaLoadout,
} from '@/lib/pricing/pricing-page'
import type { AddonKey } from '@/lib/pricing/plans'

/** One persona / package landing page. Pure data. The (type, variant) pins this persona to a Mode in
 *  lib/spaces/modes.ts, so its lexicon + recommended add-ons are read from the one Mode registry. The
 *  recommended loadout (and its founding price) are read from the shared PERSONA_LOADOUTS in
 *  lib/pricing/pricing-page.ts by the matching slug. */
export interface Persona {
  /** URL slug, e.g. "coaches-and-healers". The canonical persona slug: the /for door, the pricing
   *  "by who you are" strip, and this registry all share ONE vocabulary. The page lives at /for/<slug>. */
  slug: string
  /** The Mode (Space type) this persona maps to. */
  type: SpaceType
  /** The Focus variant this persona leads with (the Mode's package focus). */
  variant: string
  /** The plain "for <who>" noun, e.g. "Coaches" (the H1 + nav label). */
  audience: string
  /** A short plain headline of the package focus, e.g. "Packages, scheduling, and a client CRM." */
  focus: string
  /** Three or four plain, concrete capability lines for this operating model. No hype. */
  highlights: string[]
}

// The persona set — one row per the plan's named landing pages (SPACE-MODES-PLAN §4a). Each pins to a
// Mode + Focus that resolves in lib/spaces/modes.ts; the build-time test asserts every (type, variant)
// resolves so a renamed Mode never leaves a dead persona page.
export const PERSONAS: Persona[] = [
  {
    slug: 'coaches-and-healers',
    type: 'business',
    variant: 'packages',
    audience: 'Coaches and healers',
    focus: 'Sell multi-session packages, fill your calendar, and keep a client CRM in one place.',
    highlights: [
      'Sell packages and programs, with scheduling built in.',
      'A client CRM that follows each person from first call to renewal.',
      'The Resonance Engine reads your community and suggests who to reach out to next.',
      'Marketing automation, team roles, and your own domain come with Business.',
    ],
  },
  {
    slug: 'studios',
    type: 'business',
    variant: 'membership',
    audience: 'Studios',
    focus: 'Run recurring classes, sell memberships, and check people in at the door.',
    highlights: [
      'Memberships and class packs with recurring billing.',
      'Check-in at the door, with a QR code on the wall.',
      'A member CRM that flags who is lapsing.',
      'Marketing automation, team roles, and your own domain come with Business.',
    ],
  },
  {
    slug: 'event-hosts',
    type: 'business',
    variant: 'ticketed',
    audience: 'Event hosts',
    focus: 'Sell tickets, check attendees in, and fill the room.',
    highlights: [
      'Tickets and passes, sold from your Space.',
      'Check-in at the door with a QR code.',
      'Dispatch to message everyone who has a ticket.',
      'Everything is in Business at $29 a month, no add-ons required.',
    ],
  },
  {
    slug: 'community-builders',
    type: 'business',
    variant: 'cohort',
    audience: 'Community builders',
    focus: 'Run circles and memberships, and connect the right people to each other.',
    highlights: [
      'Circles, cohorts, and memberships in one place.',
      'A member CRM that keeps track of who is who.',
      'The Resonance Engine turns your community signals into live matches between the right people.',
      'Marketing automation, team roles, and your own domain come with Business.',
    ],
  },
  {
    slug: 'nonprofits',
    type: 'nonprofit',
    variant: 'donations',
    audience: 'Nonprofits',
    focus: 'Raise money, grow your supporters, and run your programs, with donations built in.',
    highlights: [
      'Donations and recurring giving, with a supporter CRM.',
      'Programs and enrollment when you run them.',
      'Everything in Business, with donations built in.',
      'No take-rate on what you raise, ever, for verified 501(c)(3) organizations.',
    ],
  },
]

/** Look up one persona by slug, or undefined. PURE. */
export function getPersona(slug: string): Persona | undefined {
  return PERSONAS.find((p) => p.slug === slug)
}

/** Every persona slug, drives generateStaticParams + the sitemap. PURE. */
export function personaSlugs(): string[] {
  return PERSONAS.map((p) => p.slug)
}

/** Where a finished operator from THIS persona door is admitted: Create-a-Space pre-seeded in the persona's
 *  Mode (OPERATOR-FUNNELS §5 Start-free bridge), NOT the general Beta list. Config-driven off the row's own
 *  (type, variant), so it is one data edit per door and can never drift from the persona's Space Mode.
 *  Re-validated at redirect time by isSafeInAppPath / funnelLanding. PURE. */
export function personaFunnelDestination(persona: Persona): FunnelDestination {
  return { mode: 'direct', url: spaceCreatePath({ type: persona.type, variant: persona.variant }) }
}

/** The shared loadout row (recommended add-ons + computed founding price) for a persona, matched by
 *  slug to the single PERSONA_LOADOUTS source in lib/pricing/pricing-page.ts. Falls back to a Pro-only
 *  row if a persona has no loadout entry (defensive; the test asserts every persona has one). PURE. */
export function personaLoadout(persona: Persona): LoadoutStripRow {
  const def: PersonaLoadout =
    PERSONA_LOADOUTS.find((l) => l.slug === persona.slug) ??
    ({ slug: persona.slug, label: persona.audience, addons: [], note: persona.focus } as PersonaLoadout)
  return loadoutStripRow(def)
}

/** The resolved Mode profile a persona leads with (for the lexicon + recommended add-ons). Total: a
 *  persona always pins to a registered Mode, so this returns a profile; the test guards it. PURE. */
export function personaMode(persona: Persona): ModeProfile | null {
  return resolveMode(persona.type, persona.variant)
}

/** The plain label for an add-on key (from the pricing-page add-on table), e.g. "AI Engine". PURE. */
export function addonLabel(addon: AddonKey): string {
  return PRICING_ADDONS.find((a) => a.key === addon)?.label ?? addon
}

// ── Generated copy (one place, so the page + metadata + JSON-LD never drift) ───

/** The fully-resolved, voice-compliant copy a persona page renders. Pure. */
export interface PersonaCopy {
  /** H1, as the reader would search it: "Frequency for Coaches". */
  h1: string
  /** Meta title an engine can lift. */
  metaTitle: string
  /** Meta + OG description, plain, under ~160 chars. */
  description: string
  /** A punchier OG title for social cards. */
  ogTitle: string
  /** The answer-first lede: what the package focus is, in one paragraph. */
  lede: string
  /** The recommended-loadout sentence with the founding price, plain. */
  loadoutLine: string
  /** The page's answer-first FAQ pairs (also fed to FAQPage schema). */
  faq: { q: string; a: string }[]
}

/** Build the persona page copy from a row. No I/O, fully testable. PURE. */
export function personaCopy(persona: Persona): PersonaCopy {
  const loadout = personaLoadout(persona)
  const total = stripTotalLabel(
    PERSONA_LOADOUTS.find((l) => l.slug === persona.slug) ??
      ({ slug: persona.slug, label: persona.audience, addons: [], note: persona.focus } as PersonaLoadout),
  )

  const addonNames = loadout.addons.map(addonLabel)
  const isNonprofit = persona.slug === 'nonprofits'
  const addonPhrase =
    addonNames.length === 0
      ? 'Business, no add-ons required'
      : `Business plus the ${addonNames.join(' and ')} add-on`

  const h1 = `Frequency for ${persona.audience}`
  const metaTitle = `Frequency for ${persona.audience}: ${persona.focus}`
  const description = `Frequency for ${persona.audience.toLowerCase()}: ${persona.focus} It runs ${total}, one honest price, never per seat.`
  const ogTitle = `Frequency for ${persona.audience}`
  const lede = `${persona.focus} You keep 100% of your own bookings, and your people are always yours to export. Business is $29 a month with the full depth, the Nonprofit plan is $39 a month flat, and the Resonance Engine add-on is optional when you want live matches. Yearly is two months free.`

  const loadoutLine = isNonprofit
    ? `Nonprofits run on the Nonprofit plan at ${total}, flat and never per seat. It carries the full Collective toolkit with donations built in, and no take-rate on what you raise, for verified 501(c)(3) organizations.`
    : `The setup for ${persona.audience.toLowerCase()} is ${addonPhrase}, which runs ${total}. Yearly is two months free, and there are no per-seat fees.`

  const faq = [
    {
      q: `How much does Frequency cost for ${persona.audience.toLowerCase()}?`,
      a: `${loadoutLine} Business is $29 a month, the Nonprofit plan is $39 a month flat, and the Resonance Engine add-on is optional on any paid plan. You keep 100% of your own bookings; we earn only on business the network sends you, at a rate that drops as your plan rises.`,
    },
    {
      q: `What is included for ${persona.audience.toLowerCase()}?`,
      a: `${persona.highlights.join(' ')} Every plan includes a branded Space site and custom domain, QR Studio, bookings, tickets, enrollment, check-in, donations, memberships, the full CRM, marketing automation, team roles, and analytics.`,
    },
    {
      q: `Can I change my plan later?`,
      a: `Yes. Turn the Resonance Engine on or off anytime; it has a 14-day trial and prorates, so you only pay for what you have on. Yearly billing is two months free. Your people are yours: export any time, we earn your stay.`,
    },
    {
      q: `Where does the money go?`,
      a: `A paid plan keeps Frequency independent. It pays the people and the infrastructure that run it, so a Space is funding the work, not just renting software.`,
    },
  ]

  return { h1, metaTitle, description, ogTitle, lede, loadoutLine, faq }
}
