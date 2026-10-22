// OPERATOR FUNNEL DOORS — the config schema (ADR-591). One chrome-free conversion template renders a
// fixed section skeleton and pulls ALL copy from a per-niche config; only copy + which features are
// surfaced change. This is the "one template, five configs" contract (docs/OPERATOR-FUNNELS.md).
//
// Naming note: the internal concept is a "funnel door", NOT "splash" — "splash" is already the QR /
// micro-site scan-time interstitial (lib/qr/splash.ts, the Loom splash lane). The public route is the
// evolved persona door /for/<niche> (short slugs, ADR-591), so these funnels ARE the /for pages.
//
// Voice + naming are locked (docs/CONTENT-VOICE §10, docs/NAMING): plain sentences, the skeptic test,
// NO em dashes, never "AI Engine" (the add-on is listed as Vera AI, 2026-07 overhaul; the Resonance Engine is the machinery, ADR-590), marketing email is
// "Email + Automations" (never "Dispatch", a reserved broadcast term), the Space site is "Profile and
// brand" / "your page", the CRM tool is "Contacts", the scheduler is "Bookings", the code tool is
// "QR Studio". The free tier RUNS THE BUSINESS: it hosts, holds a contact list, and takes tips, on
// launch-sized limits. Selling starts at Business (ADR-1709, the five-tier ladder).
//
// 🔴 THE ARGUMENT FOR PAYING IS MONEY, NOT MORE (LIVE-255). Every door says the same sentence in its
// own words: PEOPLE JOIN FREE, BUSINESSES HOST FREE, YOU PAY WHEN YOU START CHARGING. The one thing
// that genuinely needs a plan is named plainly, because naming it is what makes the promise checkable:
// taking payments (paid tickets, memberships, donations, shop checkout, booking deposits) opens at
// Business, and tips stay open on every plan (ADR-1709). Do not reintroduce a "paid does more / lifts
// the caps / unlocks" beat here, and that includes a SECTION TITLE (LIVE-255). Do not reintroduce the
// retired ADR-914 framing either (LIVE-911): six spark cards titled a plan as the reason for the
// repeat, selling email, reminders and nudges as plan features, and a free Space runs them
// (PLAN_STORY.paid). The spark cards now name
// the repeat they serve with no plan attached, and every line that SELLS says Business beside it.
// Every 0% or "nothing taken" promise carries "plus card processing": Frequency takes no network fee
// on your own people, and the card processor still takes its own. Everything else is a meter, and
// the caps are never typed here, they live in lib/pricing/feature-meters.ts (ADR-837) and the copy
// stays qualitative.

import { OPERATOR_CTA_LABEL } from '@/lib/site'
import type { ArchetypeId } from '@/lib/audience/archetypes'
import { NICHE_FUNNEL_DESTINATIONS, type FunnelDestination } from '@/lib/funnels/definitions'
import { priceStringsFrom, defaultPricingInput } from '@/lib/pricing/pricing-page'
import type { PricingGridInput } from '@/lib/pricing/pricing-grid'
import { formatBps } from '@/lib/pricing/display'
import { networkTakeRateBpsForPlan, networkTakeRateFromStored } from '@/lib/billing/pricing-keys'

// ── The small, consistent feature-icon set (drawn once, house tokens) ─────────────────────────────
export type FunnelIconName = 'calendar' | 'contact' | 'qr' | 'envelope' | 'spark'

// ── Section shapes ─────────────────────────────────────────────────────────────────────────────────

export interface FunnelHero {
  eyebrow: string
  h1: string
  /** Keyword-rich <title> (the h1 is a benefit line and carries no niche keyword). Falls back to h1
   *  when absent. Keep it ~55 chars including the "· Frequency" title template. */
  seoTitle?: string
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
  /** The plan name shown, e.g. "Free", "Business", "+ Vera AI" (the add-on's public name; `kind`
   *  stays `resonance`, the machinery's id, ADR-590). */
  name: string
  /** The right-hand descriptor, e.g. "Host free, and tips carry no platform fee, plus card processing", "AI that works
   *  for you". Rates come from the shared RATE map, never typed here. */
  detail: string
  /** Featured row (the one the niche is steered toward). */
  featured?: boolean
}

interface FunnelFaq {
  q: string
  a: string
}

/** A full niche funnel config. Hero / Problem / HowItWorks / Features / Pricing rows / FAQ / FinalCTA are
 *  per-niche; the Loop copy, Mission, AssuranceBar base, and Footer are SHARED constants below (a config
 *  may override the assurance bar for the nonprofit swap). */
export interface FunnelConfig {
  /** The /for/<slug> route (short slug, ADR-591). A SEARCH keyword, so it can be long. */
  slug: string
  /** The funnel SEQUENCE slug this door starts (ADR-1238): the `/join?seq=<niche>` the Start free button
   *  builds, and the key of NICHE_FUNNEL_DESTINATIONS that lands the finished operator in Create-a-Space
   *  pre-seeded in the niche's Mode. This is the ONE bridge between the door vocabulary
   *  (`coaches-and-healers`) and the funnel vocabulary (`coaches`); the Mode itself is declared once, on
   *  the destination row, never here. */
  niche: string
  /** The Builder or Latent Leader archetypes this door is written for (ADR-1715, CONTENT-VOICE §2).
   *  Internal: it steers copy and reporting, and never renders on the page. */
  archetypes: readonly ArchetypeId[]
  hero: FunnelHero
  /** Answer-first meta description (~150 chars). The hero subhead is written for the page and runs long
   *  (184 chars truncates in SERPs), so set this for the crawlable summary. Falls back to subhead. */
  metaDescription?: string
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
// DERIVED, not declared (ADR-1197). This was a third independent CTA constant sitting beside
// BETA_CTA_LABEL and the home page's own override — the five-labels-for-one-entrance problem, one
// third of it. The operator doors and the operator marketing pages now say the same word because
// they read the same constant.
export const FUNNEL_CTA_LABEL: string = OPERATOR_CTA_LABEL
/** The one ghost secondary, Hero only, scrolls to How it works. */
export const FUNNEL_SECONDARY_LABEL = "See what's inside"

/** The base assurance bar (four items). The nonprofit route overrides the last item. */
const ASSURANCE_BASE = [
  'Works in minutes',
  'No contracts',
  'Your contacts export any time',
  'One honest price',
] as const

const ASSURANCE_NONPROFIT = [
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
  tagline: 'The community collective.',
  links: [
    // A door has to lead somewhere other than out. Before this the footer carried only legal
    // boilerplate and the header carried only the logo, so an operator who wanted the numbers
    // before deciding had no route to them from the page selling them (ADR-1197, LIVE-147).
    { label: 'Pricing', href: '/pricing' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Contact', href: 'mailto:hello@frequencylocal.com' },
  ],
} as const

// ── THE CONFIGS ARE BUILT FROM THE PRICING INPUT (SCAN-793) ───────────────────────────────────────
// This module used to compute P and RATE at load from the code defaults, so an /admin/pricing edit
// moved /pricing and llms.txt and left every /for door quoting the old fee. The route resolves the
// operator's config (loadPricingInput) and hands it to getFunnelConfig; the words are unchanged, only
// the figures they interpolate now come from the input. The body is not re-indented on purpose, so the
// copy diff stays readable.
function buildFunnelConfigs(input: PricingGridInput): Record<string, FunnelConfig> {
// Every dollar figure in the funnel copy interpolates from the resolved catalog in the input, so no FAQ
// answer here can quote a price the catalog does not carry.
const P = priceStringsFrom(input.catalog)

// Every RATE interpolates from the take-rate vector in the input (the operator's config over the code
// defaults, resolved by the route). Only a plan that takes payments has a fee (ADR-1709): the free row
// quotes tips at 0%, never the free rung, which stays in the vector as a default-deny value only.
const rates = networkTakeRateFromStored(input.values.take_rate)
const RATE = {
  business: formatBps(networkTakeRateBpsForPlan('business', rates)),
}
/** The free-tier row's honest descriptor: a free Space hosts, and takes tips with no platform fee, plus card processing. */
const FREE_ROW_DETAIL = 'Host free, and tips carry no platform fee, plus card processing'
/** The business row's descriptor: selling opens here, with the introduction fee beside it. */
const BUSINESS_ROW_DETAIL = `Selling starts here, ${RATE.business} once per introduced customer`
/** The break-even proof, stated once: the fee only ever applies to a NEW person the network brought. */
function breakEvenCaption(keep: string): string {
  return `No network fee on ${keep}, ever, only card processing. Frequency earns only when the network introduces someone new, once, and after that it's 0% for good.`
}

/** The shared pricing-beat intro. It leads with the promise, not the plan: hosting is free, and that
 *  is the point; Business is what a Space takes when it starts charging (ADR-1709). The per-niche
 *  clause names the moment a door's reader would actually step up. */
function pricingIntro(stepUp: string): string {
  return `People join free, hosting is free with Crew, and you pay when you start charging. A free Space runs the whole thing and takes tips with no platform fee, plus card processing, and your own people are always free. ${stepUp} One price, and the fee is only on the customers we introduce.`
}

/** The shared what-does-it-cost FAQ answer, with the per-niche "no network fee on ..." clause and an
 *  optional extra sentence (the community-builders Collective line). One template, five doors. */
function costAnswer(keep: string, extra = ''): string {
  return `Nothing to be here, and nothing to host. A free Space runs your page, contacts, bookings and events, and takes tips with no platform fee, plus card processing. You pay when you start charging: Business is ${P.businessList} a month, or two months free if you pay for the year, and it opens paid tickets, memberships, bookings, donations and your shop, with ${RATE.business} on a customer the network introduces, once, and 0% on the people already yours. There's no network fee on ${keep}, only card processing.${extra} You always see the full number, nothing hidden.`
}


// ── Config #1: Coaches & Healers (the reference build) ─────────────────────────────────────────────

const COACHES_FUNNEL: FunnelConfig = {
  // Canonical persona slug (ADR-590): the /for door, the pricing "by who you are" strip, and the persona
  // registry all speak ONE slug vocabulary now, so the strip card lands here instead of 404ing.
  slug: 'coaches-and-healers',
  niche: 'coaches',
  archetypes: ['second_act'],
  hero: {
    eyebrow: 'For coaches and guides',
    h1: 'Your practice, without the six tabs.',
    seoTitle: 'Booking + contacts software for coaches and guides',
    subhead:
      "Bookings, payments, and every person you've met, together in one place. Frequency keeps your relationships close, so the people you meet come back, and bring the next ones. Start free.",
    microcopy: 'No card. You pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    'Frequency gives coaches and guides bookings, payments, and one contact list in one place, so clients rebook and refer. Free to start, no card.',
  problem: {
    header: 'The work is the calling. The admin is the tax.',
    body: 'Your calendar lives in one app, payments in another, client notes in a notebook and in your head. You mean to follow up, and the day gets away from you. So the client who came once never books again, and you never quite know why. None of it is why you started.',
    caption: 'Six tabs, one you.',
  },
  howItWorks: {
    header: 'One place. Ready before your next session.',
    steps: [
      { title: 'Make your Space.', body: 'Your page, your name, and your work, ready in a few minutes. Free to start, always.' },
      {
        title: 'Bring your people in.',
        body: 'Scan a card, import a list, or share your Frequency card. Everyone lands in Contacts.',
      },
      { title: 'Open your calendar.', body: "Take bookings the same day, right from the page clients already see. Paid sessions open when you go Business." },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  // The order ESCALATES to the growth engine: get paid -> remember everyone -> grow through them, which
  // sets up the Loop. The third block is the page's unique idea, not a feature.
  features: [
    {
      icon: 'calendar',
      title: 'Booked and paid, without the chase.',
      body: "Clients pick a time, and on Business they pay up front. No back and forth, no chasing invoices. Your calendar fills, and your evenings come back.",
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
      title: 'Bring them back for the second session.',
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
    intro: pricingIntro('When your practice starts charging for sessions and packages, that is Business.'),
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'business', name: 'Business', detail: BUSINESS_ROW_DETAIL, featured: true },
      { kind: 'resonance', name: '+ Vera AI', detail: 'AI that works for you' },
    ],
    breakEvenCaption: breakEvenCaption('the bookings you bring in yourself'),
    note: "We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you're never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most practitioners are taking bookings the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: costAnswer('your own bookings'),
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
    microcopy: 'No card. You pay when you start charging.',
  },
}

// ── Config #2: Studios (business:membership) ───────────────────────────────────────────────────────

const STUDIOS_FUNNEL: FunnelConfig = {
  slug: 'studios',
  niche: 'studios',
  archetypes: ['studio_keeper'],
  hero: {
    eyebrow: 'For studios and instructors',
    h1: 'Every class, every member, one place.',
    seoTitle: 'Membership + class booking software for studios and instructors',
    subhead:
      "Recurring classes, memberships, and check-in at the door, together in one place, whether you run the room or teach in several. Frequency keeps your students close, so the regulars come back and bring the next ones. Start free.",
    microcopy: 'No card. You pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    'Frequency gives studios and instructors recurring classes, memberships, and door check-in in one place, so students rebook and refer. Free to start, no card.',
  problem: {
    header: 'The classes are full. The back office is a mess.',
    body: 'Your schedule lives in one app, memberships in another, and the front desk keeps a paper list. A member lapses and you catch it a month later. The regular who could bring three friends never gets asked. None of that is why you opened the doors.',
    caption: 'Six tabs, one front desk.',
  },
  howItWorks: {
    header: 'One place. Ready before your next class.',
    steps: [
      { title: 'Make your Space.', body: 'Your studio page, your schedule, and your classes, ready in a few minutes. Free to start, always.' },
      { title: 'Bring your members in.', body: 'Import your roster or share your Frequency card. Everyone lands in Contacts.' },
      { title: 'Open your schedule.', body: 'Check people in at the door the same day, and sell memberships and class packs on Business.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  features: [
    {
      icon: 'calendar',
      title: 'Classes and memberships, billed on time.',
      body: 'On Business, sell memberships and class packs with recurring billing. Members book their own spots, and payments run themselves.',
    },
    {
      icon: 'contact',
      title: 'A member list that flags who is lapsing.',
      body: 'Contacts holds every member and tracks who has stopped showing up, while there is still time to reach them.',
    },
    {
      icon: 'qr',
      title: 'Your studio grows through the members you have.',
      body: 'A QR code on the wall checks people in, and turns each visit into an invitation. The member who loves the class brings a friend, and the friend fills another spot.',
    },
    {
      icon: 'spark',
      soft: true,
      title: 'Bring them back for the second month.',
      body: 'Email to bring quiet members back, reminders that send themselves, and a nudge when someone is drifting.',
    },
  ],
  loop: {
    header: 'Every visit, an open door.',
    intro: 'This is how a studio grows here. Not through ads, but through the members already on the mat.',
    payoff: 'A member checks in with a scan, loves the class, and invites a friend. The friend joins, comes back, and brings the next one.',
  },
  pricing: {
    header: 'One honest price.',
    intro: pricingIntro('When your studio starts selling classes and memberships, that is Business.'),
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'business', name: 'Business', detail: BUSINESS_ROW_DETAIL, featured: true },
      { kind: 'resonance', name: '+ Vera AI', detail: 'AI that works for you' },
    ],
    breakEvenCaption: breakEvenCaption('the memberships you sell yourself'),
    note: "We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most studios are taking bookings the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: costAnswer('the memberships you sell'),
    },
    { q: 'Can I take my members with me?', a: 'Yes, any time. Export your whole member list whenever you want.' },
    { q: 'Will my members need to download anything?', a: 'No. They book and pay from a link, and check in with a QR code.' },
    {
      q: 'What if I also run workshops or events?',
      a: 'It grows with you. The same Space handles tickets, one-off workshops, and check-in when you are ready.',
    },
    { q: 'Is my member information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: 'Run the studio, not the back office.',
    subhead: 'Your classes, your memberships, and every member, held together in one place. Start free, and grow through the members you already have.',
    microcopy: 'No card. You pay when you start charging.',
  },
}

// ── Config #3: Event hosts (business:ticketed) ───────────────────────────────────────────────────────

const EVENTS_FUNNEL: FunnelConfig = {
  slug: 'event-hosts',
  niche: 'hosts',
  archetypes: ['gathering_host'],
  hero: {
    eyebrow: 'For event hosts and organizers',
    h1: 'Sell the tickets. Keep the room.',
    seoTitle: 'Ticketing + check-in software for event hosts',
    subhead:
      'Tickets, check-in, and everyone who has one, together in one place. Frequency keeps the people who showed up, so your next event fills from the last. Start free.',
    microcopy: 'No card. You pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    'Frequency gives event hosts ticketing, door check-in, and one contact list in one place, so guests come back and bring friends. Free to start, no card.',
  problem: {
    header: 'The event sells out. The list disappears the next day.',
    body: 'Tickets live in one tool, the guest list in a spreadsheet, and the door is a name check on a phone. The room was full, and a week later you cannot reach the people who filled it. So the next event starts from zero.',
    caption: 'A full room, then silence.',
  },
  howItWorks: {
    header: 'One place. Ready before doors open.',
    steps: [
      { title: 'Make your Space.', body: 'Your event page and your dates, ready in a few minutes. Free to host, always.' },
      { title: 'Open your tickets.', body: "Free RSVPs on any Space, and paid tickets when you go Business, from the page guests already see. Everyone lands in Contacts." },
      { title: 'Open the door.', body: 'Check people in with a QR code, and keep everyone who came for the next one.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  features: [
    {
      icon: 'calendar',
      title: 'Tickets sold, straight from your page.',
      body: "Sell tickets and passes from your Space on Business. Guests pick a ticket and pay up front, and a guest who's already yours carries no network fee, only card processing.",
    },
    {
      icon: 'contact',
      title: 'Everyone who came, in one place.',
      body: 'Contacts holds every guest, however they came in, so the room you filled is a list you keep, not a list you lose.',
    },
    {
      icon: 'qr',
      title: 'Each event fills from the last.',
      body: 'A QR code checks guests in at the door, and turns each attendee into an invitation. The guest who had a great night brings friends to the next one.',
    },
    {
      icon: 'spark',
      soft: true,
      title: 'Fill the second night from the first.',
      body: 'Email everyone who holds a ticket, send reminders that run themselves, and reach quiet guests before the next date.',
    },
  ],
  loop: {
    header: 'Every ticket, an open door.',
    intro: 'This is how a series grows here. Not through ads, but through the people who were actually in the room.',
    payoff: 'A guest buys a ticket, checks in with a scan, and has a great night. They bring friends to the next one, and it fills from itself.',
  },
  pricing: {
    header: 'One honest price.',
    intro: pricingIntro('When your events start selling tickets, that is Business.'),
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'business', name: 'Business', detail: BUSINESS_ROW_DETAIL, featured: true },
      { kind: 'resonance', name: '+ Vera AI', detail: 'AI that works for you' },
    ],
    breakEvenCaption: breakEvenCaption('the tickets you sell yourself'),
    note: "We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most hosts have their first event up the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: costAnswer('the tickets you sell'),
    },
    { q: 'Can I take my guest list with me?', a: 'Yes, any time. Export your whole list whenever you want.' },
    { q: 'Will my guests need to download anything?', a: 'No. They buy and check in from a link and a QR code.' },
    {
      q: 'What if I also run memberships or classes?',
      a: 'It grows with you. The same Space handles memberships and recurring classes when you are ready.',
    },
    { q: 'Is my guest information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: 'Keep the room you filled.',
    subhead: 'Your tickets, your door, and everyone who came, held together in one place. Start free, and let each event fill the next.',
    microcopy: 'No card. You pay when you start charging.',
  },
}

// ── Config #4: Venues (business:ticketed; a room that hosts other people's gatherings, ADR-1863) ─────

const VENUES_FUNNEL: FunnelConfig = {
  slug: 'venues',
  niche: 'venues',
  archetypes: ['studio_keeper'],
  hero: {
    eyebrow: 'For venues and rooms that host',
    h1: 'Fill the room, and know who filled it.',
    seoTitle: 'Booking + events software for venues and community rooms',
    subhead:
      'Your calendar, the groups that use your room, and the people who show up, held together in one place. Start free, and let every group that meets there bring people to you.',
    microcopy: 'No card. You pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    'Frequency gives venues and community rooms one calendar, one contact list and ticketing for the groups that meet there. Free to start, no card.',
  problem: {
    header: 'The room is busy. You still do not know who is in it.',
    body: 'Groups book through texts, the calendar lives in a shared sheet, and the people who walk in belong to whoever hosted. A good night leaves you with a full room and nothing to follow up on.',
    caption: 'A busy room, and no list.',
  },
  howItWorks: {
    header: 'One place for the room and the groups in it.',
    steps: [
      { title: 'Make your Space.', body: 'Your room, your hours and your upcoming nights on one page. Free to host, always.' },
      { title: 'Bring the groups in.', body: 'Hosts list their gatherings at your room, and each one shows on your calendar.' },
      { title: 'Keep the people.', body: 'Everyone who comes through the door lands in Contacts, so the next night starts with a list.' },
    ],
    caption: 'Set up in an afternoon.',
  },
  features: [
    {
      icon: 'calendar',
      title: 'One calendar for every group.',
      body: 'Every gathering at your room in one place, with each host on their own page and your room on all of them.',
    },
    {
      icon: 'qr',
      title: 'Check people in at the door.',
      body: 'A QR code checks guests in, and turns every attendee into someone you can invite back.',
    },
    {
      icon: 'contact',
      title: 'A list that stays with the room.',
      body: 'Contacts holds everyone who came, however they found you, so the room keeps its own regulars.',
    },
    {
      icon: 'spark',
      soft: true,
      title: 'Sell tickets and passes when you are ready.',
      body: 'Paid tickets, passes and rentals open on Business. A guest who is already yours carries no network fee, only card processing.',
    },
  ],
  loop: {
    header: 'Every gathering, an open door.',
    intro: 'This is how a room fills here. Not through ads, but through the groups that already meet there.',
    payoff: 'A host fills a night, a guest has a good time, and next week they bring a friend. The room fills from itself.',
  },
  pricing: {
    header: 'One honest price.',
    intro: pricingIntro('When the room starts selling tickets or passes, that is Business.'),
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'business', name: 'Business', detail: BUSINESS_ROW_DETAIL, featured: true },
      { kind: 'resonance', name: '+ Vera AI', detail: 'AI that works for you' },
    ],
    breakEvenCaption: breakEvenCaption('the tickets and passes you sell yourself'),
    note: 'We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.',
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most rooms have their calendar up the same afternoon.' },
    { q: 'What does it actually cost?', a: costAnswer('the tickets and passes you sell') },
    { q: 'Do the groups that use my room need accounts?', a: 'Hosts do, and it is free. Their guests only need a link.' },
    { q: 'Can I take my list with me?', a: 'Yes, any time. Export your whole list whenever you want.' },
    { q: 'Is my guest information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: 'Know who fills your room.',
    subhead: 'Your calendar, the groups that use it, and everyone who comes through the door, held together. Start free.',
    microcopy: 'No card. You pay when you start charging.',
  },
}

// ── Config #5: Nonprofits (nonprofit:donations; the assurance bar + pricing swap to the Non Profit plan) ─

const NONPROFITS_FUNNEL: FunnelConfig = {
  slug: 'nonprofits',
  niche: 'nonprofits',
  archetypes: ['network_steward'],
  nonprofit: true,
  hero: {
    eyebrow: 'For Non Profits and 501(c)(3) organizations',
    h1: 'Raise more. We take no cut.',
    seoTitle: 'Donations + supporter software for Non Profits',
    subhead:
      'Donations, supporters, and your programs, together in one place. Frequency holds your supporters, so giving repeats and the word travels to the next donor. Start free.',
    microcopy: 'No card. You pay when you start charging.',
    trustLine: 'No network fee on what you raise, plus card processing.',
  },
  metaDescription:
    'Frequency gives Non Profits donations, a supporter list, and program enrollment in one place, with no network fee on what you raise. Free to start, no card.',
  problem: {
    header: 'The mission is clear. The tools take a cut and a toll.',
    body: 'Donations run through one processor, supporters live in a spreadsheet, and program sign-ups in a form. Every tool takes a fee, and the recurring donor who lapsed slips by unnoticed. The money and the hours belong with the mission, not the software.',
    caption: 'Five tools, one mission.',
  },
  howItWorks: {
    header: 'One place. Ready before your next campaign.',
    steps: [
      { title: 'Make your Space.', body: 'Your organization page, your programs, and your donation form, ready in a few minutes. Free to start, always.' },
      { title: 'Bring your supporters in.', body: 'Import your list or share your Frequency card. Everyone lands in Contacts.' },
      { title: 'Open donations.', body: 'Enroll people in your programs the same day, and take one-time and recurring gifts on the Non Profit plan.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  features: [
    {
      icon: 'contact',
      title: 'Donations and a supporter list, together.',
      body: "On the Non Profit plan, take one-time and recurring gifts, and keep a supporter list that tracks every donor and flags who's lapsed.",
    },
    {
      icon: 'calendar',
      title: 'Programs and enrollment, when you run them.',
      body: 'Run programs and sign people up from the same page, with check-in when you gather in person.',
    },
    {
      icon: 'qr',
      title: 'Support grows through the supporters you have.',
      body: 'Share your Frequency card and every hello becomes a saved supporter, and an invitation in. The donor who believes in the work brings the next one.',
    },
    {
      icon: 'spark',
      soft: true,
      title: 'Ask for the second gift on time.',
      body: 'Email to bring lapsed donors back, receipts and reminders that send themselves, and a nudge when a recurring gift is about to end.',
    },
  ],
  loop: {
    header: 'Every supporter, an open door.',
    intro: 'This is how support grows here. Not through ads, but through the people who already believe in the work.',
    payoff: 'A supporter gives, sees the impact, and invites the next donor. Recurring giving compounds, and the word travels.',
  },
  pricing: {
    header: 'Free to start. Nothing taken on what you raise.',
    intro: 'Start free, and host free while you grow. Donations open on the Non Profit plan, flat and never per seat, for verified 501(c)(3) organizations, with no network fee on what you raise.',
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'nonprofit', name: 'Non Profit', detail: '0% on what you raise', featured: true },
      { kind: 'resonance', name: '+ Vera AI', detail: 'AI that works for you' },
    ],
    breakEvenCaption:
      'No network fee on what you raise, only card processing. Verified 501(c)(3) organizations pay no network take-rate on the Non Profit plan.',
    note: 'We never take a share of your donations. Your supporters export any time, so you are never locked in.',
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most organizations have their Space running the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: `Free to start and free to host. Taking donations is the Non Profit plan, ${P.nonprofit} a month flat, never per seat, for verified 501(c)(3) organizations, and there is no network fee on what you raise. You always see the full number, nothing hidden.`,
    },
    { q: 'Do you take a cut of donations?', a: "No. We never take a share of a donation. Card processing is the only fee on a gift, and it goes to the card processor, not to us." },
    { q: 'Can I take my supporters with me?', a: 'Yes, any time. Export your whole supporter list whenever you want.' },
    {
      q: 'How do we get the Non Profit plan?',
      a: 'Verify your 501(c)(3) status and the flat Non Profit plan opens, with the full toolkit and donations built in.',
    },
    { q: 'Is my supporter information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: 'Put the money where the mission is.',
    subhead: 'Your donations, your supporters, and your programs, held together in one place, with nothing taken on what you raise. Start free.',
    microcopy: 'No card. You pay when you start charging.',
  },
}

// ── Config #6: The Network (chapters under one owner, ADR-1863) ──────────────────────────────────────
// A group with chapters in several towns. Each chapter runs its own Space; the Network ties them together.
// The Network plan's number lives on /pricing, never here.

const NETWORKS_FUNNEL: FunnelConfig = {
  slug: 'networks',
  niche: 'networks',
  archetypes: ['network_steward'],
  hero: {
    eyebrow: 'For groups with chapters',
    h1: 'Many chapters. One home.',
    seoTitle: 'Chapter and member software for groups with many locations',
    subhead:
      'Each chapter keeps its own page, calendar and people. You see all of it together, and members move between chapters without starting over. Start free.',
    microcopy: 'No card. You pay when you start charging.',
    trustLine: 'Each chapter runs on its own Space.',
  },
  metaDescription:
    'Frequency gives groups with several chapters one home: every chapter has its own page and calendar, and you see the whole network together.',
  problem: {
    header: 'Every chapter runs on its own tools.',
    body: 'One town uses a spreadsheet, another a group chat, a third a sign-up form. Nobody sees the whole picture, and a member who moves has to start over.',
    caption: 'Many chapters, no overview.',
  },
  howItWorks: {
    header: 'Start with one chapter. Add the rest.',
    steps: [
      { title: 'Make your home Space.', body: 'Your Network page, with your story and your chapters listed. Free to start.' },
      { title: 'Open a chapter.', body: 'Each chapter gets its own Space, calendar and organizers, under your name.' },
      { title: 'See it together.', body: 'One report across every chapter, and one membership that works in all of them.' },
    ],
    caption: 'One chapter today, ten next year.',
  },
  features: [
    {
      icon: 'calendar',
      title: 'A calendar for every chapter, and one for all.',
      body: 'Each chapter runs its own events. The Network page shows them together.',
    },
    {
      icon: 'contact',
      title: 'Members who can move.',
      body: 'One membership, honored in every chapter, so a member who relocates keeps their place.',
    },
    {
      icon: 'spark',
      soft: true,
      title: 'One report across the network.',
      body: 'Who came, where, and how it is growing, for every chapter in one view.',
    },
    {
      icon: 'qr',
      title: 'A shared site for every chapter.',
      body: 'Each chapter can have its own website, billed to the Network. Pricing is on the pricing page.',
    },
  ],
  loop: {
    header: 'Each chapter, an open door.',
    intro: 'This is how a network grows here. Not through ads, but through the chapters people already love.',
    payoff: 'A member finds one chapter, loves it, and tells the next town. The network grows from the inside.',
  },
  pricing: {
    header: 'Start free. Add the Network when you are ready.',
    intro: pricingIntro('When your chapters start charging, each one is Business.'),
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'business', name: 'Business', detail: BUSINESS_ROW_DETAIL, featured: true },
    ],
    breakEvenCaption: breakEvenCaption('what your chapters sell to their own people'),
    note: 'The Network plan joins your chapters under one home. Its price is on the pricing page, and you always see the full number.',
  },
  faq: [
    { q: 'Do I need all my chapters to start?', a: 'No. Start with one and add the rest as they are ready.' },
    { q: 'What does it cost?', a: costAnswer('what your chapters sell') },
    { q: 'Can a chapter leave with its people?', a: 'Yes. Contacts export any time, so nothing is locked in.' },
    { q: 'Is member information private?', a: 'Yes. Contacts are held securely and never sold.' },
  ],
  finalCta: {
    header: 'Bring every chapter home.',
    subhead: 'Your chapters, your members and one view of all of it. Start free, and add the Network when you are ready.',
    microcopy: 'No card. You pay when you start charging.',
  },
}

// ── The registry (ADR-591): one config per persona door, keyed by the SAME canonical slug the pricing
// "by who you are" strip and the persona registry use, so every strip card lands on a real, on-topic page
// (never a 404). Adding a door = one config + one row here. ────────────────────────────────────────────
return {
  'coaches-and-healers': COACHES_FUNNEL,
  studios: STUDIOS_FUNNEL,
  'event-hosts': EVENTS_FUNNEL,
  venues: VENUES_FUNNEL,
  nonprofits: NONPROFITS_FUNNEL,
  networks: NETWORKS_FUNNEL,
}
}

/** The code-default configs: the slug list, the tests, and any caller that passes no input. */
const DEFAULT_FUNNEL_CONFIGS = buildFunnelConfigs(defaultPricingInput())
/** Built once per resolved input (a route resolves one per revalidation), never per call. */
const CONFIGS_BY_INPUT = new WeakMap<PricingGridInput, Record<string, FunnelConfig>>()
function funnelConfigsFor(input?: PricingGridInput): Record<string, FunnelConfig> {
  if (!input) return DEFAULT_FUNNEL_CONFIGS
  let built = CONFIGS_BY_INPUT.get(input)
  if (!built) {
    built = buildFunnelConfigs(input)
    CONFIGS_BY_INPUT.set(input, built)
  }
  return built
}

/** The reference build, evaluated against the code defaults (the routing tests read it). */
export const COACHES_FUNNEL: FunnelConfig = DEFAULT_FUNNEL_CONFIGS['coaches-and-healers']

/** Resolve a funnel config by slug, or undefined. PURE. A route passes the pricing input it resolved
 *  from the operator config (SCAN-793); without one the code defaults apply. */
export function getFunnelConfig(slug: string, input?: PricingGridInput): FunnelConfig | undefined {
  return funnelConfigsFor(input)[slug]
}

/** Every funnel slug (drives generateStaticParams + sitemap + llms.txt). PURE. */
export function funnelSlugs(): string[] {
  return Object.keys(DEFAULT_FUNNEL_CONFIGS)
}

/** The assurance-bar items for a config (the nonprofit swap, else the base four). PURE. */
export function assuranceItems(config: FunnelConfig): readonly string[] {
  return config.assuranceBar ?? (config.nonprofit ? ASSURANCE_NONPROFIT : ASSURANCE_BASE)
}

/** The Start-free FALLBACK: the Space directory, where a signed-in operator creates a free Space. This was
 *  the literal every door button carried until 2026-09-07 (ADR-1238), while the niche destination map sat
 *  with no runtime reader. It survives only for a door whose `niche` has no destination row: running such a
 *  visitor through the induction would land them on the Beta waitlist, which is a worse promise than the
 *  directory. Attribution is cookie-based (first-touch captures the landing URL), so no query param rides. */
export const FUNNEL_START_FALLBACK_HREF = '/spaces'

/** Where a finished operator from THIS niche funnel is admitted: Create-a-Space pre-seeded in the niche's
 *  Mode (OPERATOR-FUNNELS §5 Start-free bridge), NOT the general Beta list. Read from the ONE destination
 *  row (NICHE_FUNNEL_DESTINATIONS) the induction's completion also reads, so the door and the landing
 *  cannot disagree. Undefined for a niche with no row. PURE. */
export function funnelStartDestination(config: FunnelConfig): FunnelDestination | undefined {
  return NICHE_FUNNEL_DESTINATIONS[config.niche]
}

/** The href every Start free button on a door renders (ADR-1238). A door whose niche has a destination row
 *  starts the niche's funnel sequence, `/join?seq=<niche>`: a signed-out visitor runs the induction with
 *  sign-up embedded and its completion lands them on that row's Space-create path; a signed-in member is
 *  sent straight to the same path. A door whose niche has NO row falls back to the Space directory, because
 *  the induction would otherwise end on the general Beta waitlist. PURE. */
export function funnelStartHref(config: FunnelConfig): string {
  return funnelStartDestination(config) ? `/join?seq=${encodeURIComponent(config.niche)}` : FUNNEL_START_FALLBACK_HREF
}
