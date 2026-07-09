// OPERATOR FUNNEL DOORS — the config schema (ADR-591). One chrome-free conversion template renders a
// fixed section skeleton and pulls ALL copy from a per-niche config; only copy + which features are
// surfaced change. This is the "one template, five configs" contract (docs/OPERATOR-FUNNELS.md).
//
// Naming note: the internal concept is a "funnel door", NOT "splash" — "splash" is already the QR /
// micro-site scan-time interstitial (lib/qr/splash.ts, the Loom splash lane). The public route is the
// evolved persona door /for/<niche> (short slugs, ADR-591), so these funnels ARE the /for pages.
//
// Voice + naming are locked (docs/CONTENT-VOICE §10, docs/NAMING): plain sentences, the skeptic test,
// NO em dashes, never "AI Engine" (it is the Resonance Engine, ADR-590), marketing email is
// "Email + Automations" (never "Dispatch", a reserved broadcast term), the Space site is "Profile and
// brand" / "your page", the CRM tool is "Contacts", the scheduler is "Bookings", the code tool is
// "QR Studio". The free tier is the WHOLE toolset on starter caps (Contacts up to 250), not a subset.

import type { SpaceType } from '@/lib/spaces/types'

// ── The small, consistent feature-icon set (drawn once, house tokens) ─────────────────────────────
export type FunnelIconName = 'calendar' | 'contact' | 'qr' | 'envelope' | 'spark'

// ── Section shapes ─────────────────────────────────────────────────────────────────────────────────

export interface FunnelHero {
  eyebrow: string
  h1: string
  subhead: string
  /** Under the CTA row, e.g. "No card. Free while you grow." */
  microcopy: string
  /** The quiet trust line; a real stat can swap in later. */
  trustLine: string
}

/** A numbered how-it-works step (title + one plain line). */
export interface FunnelStep {
  title: string
  body: string
}

/** An outcome-headline feature row. `soft` marks the lighter "grows with you" row rendered last. */
export interface FunnelFeature {
  title: string
  body: string
  icon: FunnelIconName
  soft?: boolean
}

/** One row of the 3-row funnel pricing beat. The dollar amounts render from the pricing catalog
 *  (lib/pricing/pricing-page.ts) so they never drift; the config carries only the row's identity + the
 *  take-rate / value wording. `kind` selects which catalog figure the component reads. */
export interface FunnelPriceRow {
  kind: 'free' | 'business' | 'nonprofit' | 'resonance'
  /** The plan name shown, e.g. "Free", "Business", "+ Resonance". */
  name: string
  /** The right-hand descriptor, e.g. "5% on what you sell", "3% on what you sell", "AI that works for you". */
  detail: string
  /** Featured row (the one the niche is steered toward). */
  featured?: boolean
}

export interface FunnelFaq {
  q: string
  a: string
}

/** A full niche funnel config. Hero / Problem / HowItWorks / Features / Pricing rows / FAQ / FinalCTA are
 *  per-niche; the Loop copy, Mission, AssuranceBar base, and Footer are SHARED constants below (a config
 *  may override the assurance bar for the nonprofit swap). */
export interface FunnelConfig {
  /** The /for/<slug> route (short slug, ADR-591). */
  slug: string
  /** The Space Mode a "Start free" pre-seeds for this niche (the signup bridge, funnels P2). */
  mode: { type: SpaceType; variant: string }
  hero: FunnelHero
  problem: { header: string; body: string; caption: string }
  howItWorks: { header: string; steps: FunnelStep[]; caption: string }
  features: FunnelFeature[]
  /** The 3-row pricing beat + the break-even caption + the fee note. */
  pricing: { header: string; intro: string; rows: FunnelPriceRow[]; breakEvenCaption: string; note: string }
  faq: FunnelFaq[]
  finalCta: { header: string; subhead: string; microcopy: string }
  /** The Loop section copy: a setup line ABOVE the diagram (intro) + a plain payoff line BELOW it, so a
   *  cold visitor understands exactly how a practice grows here. Falls back to the shared LOOP_COPY. */
  loop?: { header?: string; intro?: string; payoff?: string }
  /** Override the shared 4-item assurance bar (the nonprofit route swaps the last item). */
  assuranceBar?: readonly string[]
  /** Give the Loop diagram extra prominence (rendered again after HowItWorks). Community builders. */
  loopProminent?: boolean
  /** The verified-501c3 route: pricing shows Free / Nonprofit / +Resonance and "on what you raise". */
  nonprofit?: boolean
}

// ── SHARED constants (identical on every funnel; do not re-author per niche) ───────────────────────

/** The one primary CTA label everywhere (Hero, Pricing, FinalCTA). */
export const FUNNEL_CTA_LABEL = 'Start free'
/** The one ghost secondary, Hero only, scrolls to How it works. */
export const FUNNEL_SECONDARY_LABEL = "See what's inside"

/** The base assurance bar (four items). The nonprofit route overrides the last item. */
export const ASSURANCE_BASE = [
  'Works in minutes',
  'No contracts',
  'Your contacts export any time',
  'One honest price',
] as const

export const ASSURANCE_NONPROFIT = [
  'Works in minutes',
  'No contracts',
  'Your contacts export any time',
  'Flat price, never per seat',
] as const

/** The signature loop copy (same on every funnel). The graphic is the Contacts + QR referral loop. */
export const LOOP_COPY = {
  header: 'Every hello, remembered.',
  caption: 'Every introduction, an open door.',
} as const

/** The founder's-why mission block, identical on all five. */
export const MISSION_COPY = {
  header: 'Built by someone who needed it.',
  body: "Frequency started in a healing practice, from the same pile of tabs and lost follow-ups. It's built on one belief: that real connection is the product, and the tools should get out of the way so you can do the work. This is a place for aligned people to hold their communities, and to lend each other their audiences. You're not a user here. You're part of it.",
} as const

/** The minimal splash footer (logo + tagline + a minimal legal row; no other exits). */
export const FUNNEL_FOOTER = {
  tagline: 'A place to be human.',
  links: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Contact', href: '/contact' },
  ],
} as const

// ── Config #1: Coaches & Healers (the reference build) ─────────────────────────────────────────────

export const COACHES_FUNNEL: FunnelConfig = {
  slug: 'coaches',
  mode: { type: 'business', variant: 'packages' },
  hero: {
    eyebrow: 'For coaches, healers, and guides',
    h1: 'Your practice, held.',
    subhead:
      "Bookings, payments, and every person you've met, together in one place. Frequency keeps your relationships close, so the people you meet come back, and bring the next ones. Start free.",
    microcopy: 'No card. Free while you grow.',
    trustLine: 'A place to be human.',
  },
  problem: {
    header: 'The work is the calling. The admin is the tax.',
    body: 'Your calendar lives in one app, payments in another, client notes in a notebook and in your head. You mean to follow up, and the day gets away from you. So the client who came once never books again, and you never quite know why. None of it is why you started.',
    caption: 'Six tabs, one you.',
  },
  howItWorks: {
    header: 'One place. Ready before your next session.',
    steps: [
      { title: 'Make your Space.', body: 'Your page, your name, your work. Free.' },
      {
        title: 'Bring your people in.',
        body: 'Scan a business card and it fills itself in, import your list, or share your Frequency card. Everyone lands in Contacts.',
      },
      { title: 'Open your calendar.', body: 'Take bookings and payments the same day.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  // The order ESCALATES to the growth engine: get paid -> remember everyone -> grow through them, which
  // sets up the Loop. The third block is the page's unique idea, not a feature.
  features: [
    {
      icon: 'calendar',
      title: 'Booked and paid, without the chase.',
      body: 'Clients pick a time and pay up front. No back and forth, no chasing invoices. Your calendar fills, and your evenings come back.',
    },
    {
      icon: 'contact',
      title: "Every person you've met, in one place.",
      body: 'Contacts holds your relationships, however they came in. Scan a business card and it fills itself in. Meet someone at an event and they save you back. The list you keep in five places, finally in one.',
    },
    {
      icon: 'qr',
      title: 'Your practice grows through the people you meet.',
      body: 'Share your Frequency card and every hello becomes a saved contact, and an invitation in. The client who loved their session brings a friend. Word of mouth, working for you instead of getting lost.',
    },
    {
      icon: 'spark',
      soft: true,
      title: "When you're ready, it does more.",
      body: "Email to bring quiet clients back. Reminders that send themselves, so no one slips. And a nudge when someone's drifting, while there's still time to reach them.",
    },
  ],
  loop: {
    header: 'Every hello, an open door.',
    intro: 'This is how a practice grows here. Not through ads, but through the people you actually meet.',
    payoff: 'You meet someone, save them with a scan, and invite them in. They join, and they come back, and they bring the next person.',
  },
  pricing: {
    header: 'One honest price.',
    intro: 'Start free, and stay free while you grow. When your practice takes off, one plan opens everything. No add-on menu, no surprise fees.',
    rows: [
      { kind: 'free', name: 'Free', detail: '5% on what you sell' },
      { kind: 'business', name: 'Business', detail: '3% on what you sell', featured: true },
      { kind: 'resonance', name: '+ Resonance', detail: 'AI that works for you' },
    ],
    breakEvenCaption:
      'Around $2,500 a month in sales, Business pays for itself on the fee saving alone. Before a single feature.',
    note: "You always see the full number, our 3% plus card processing. And your contacts export any time, so you're never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most practitioners are taking bookings the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: 'Free to start. Business is $49 a month, and most coaches add Resonance for $69 total. You always see the full fee, ours plus card processing, nothing hidden.',
    },
    { q: 'Can I take my contacts with me?', a: 'Yes, any time. Download a VCard or export your whole list.' },
    { q: 'Will my clients need to download anything?', a: 'No. They book and pay from a link.' },
    {
      q: 'What if I also run classes or events?',
      a: "It grows with you. The same Space handles memberships, tickets, and check-in when you're ready.",
    },
    { q: 'Is my client information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: 'Come home to one place.',
    subhead: "Your bookings, your payments, and every person you've met, held together. Start free, and grow through the people you meet.",
    microcopy: 'No card. Free while you grow.',
  },
}

// ── The registry (the other four niches land here in funnels P3) ──────────────────────────────────
export const FUNNEL_CONFIGS: Record<string, FunnelConfig> = {
  coaches: COACHES_FUNNEL,
}

/** Resolve a funnel config by slug, or undefined. PURE. */
export function getFunnelConfig(slug: string): FunnelConfig | undefined {
  return FUNNEL_CONFIGS[slug]
}

/** Every funnel slug (drives generateStaticParams + sitemap + llms.txt). PURE. */
export function funnelSlugs(): string[] {
  return Object.keys(FUNNEL_CONFIGS)
}

/** The assurance-bar items for a config (the nonprofit swap, else the base four). PURE. */
export function assuranceItems(config: FunnelConfig): readonly string[] {
  return config.assuranceBar ?? (config.nonprofit ? ASSURANCE_NONPROFIT : ASSURANCE_BASE)
}
