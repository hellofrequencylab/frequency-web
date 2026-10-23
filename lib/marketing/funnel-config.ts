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

import { FOUNDING_PLACE, OPENING_DATE_LABEL, OPERATOR_CTA_LABEL } from '@/lib/site'
import type { ArchetypeId } from '@/lib/audience/archetypes'
import { NICHE_FUNNEL_DESTINATIONS, type FunnelDestination } from '@/lib/funnels/definitions'
import { priceStringsFrom, defaultPricingInput } from '@/lib/pricing/pricing-page'
import type { PricingGridInput } from '@/lib/pricing/pricing-grid'
import { formatBps } from '@/lib/pricing/display'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
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
  kind: 'free' | 'business' | 'nonprofit' | 'network' | 'resonance'
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
  'Start with your page',
  'No contracts',
  'Your contacts export any time',
  'One honest price',
] as const

const ASSURANCE_NONPROFIT = [
  'Start with your page',
  'No contracts',
  'Your contacts export any time',
  'Flat price, never per seat',
] as const

/** The signature loop copy (same on every funnel). The graphic is the Contacts + QR referral loop. */
export const LOOP_COPY = {
  header: 'Meet, remember, invite.',
  caption: 'Share a date. Welcome people. Keep in touch.',
} as const

/** The founder's-why mission block, identical on all five. */
export const MISSION_COPY = {
  header: 'Built by someone who needed it.',
  body: "Frequency started in a healing practice, from the same pile of tabs and lost follow-ups. It's a place for community builders to share a class, welcome people at a gathering and keep in touch afterward. Start with the people you meet and the work you want to do together.",
} as const

/** The minimal splash footer (logo + tagline + a minimal legal row; no other exits). */
export const FUNNEL_FOOTER = {
  tagline: 'Get people together. Do things on purpose.',
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
const NETWORK_ROW_DETAIL = 'One home for every chapter, each with its own page, calendar and leaders'
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
  return `${PLAN_STORY.crewSpace} You pay for Business when you start charging: Business is ${P.businessList} a month, or two months free if you pay for the year, and it opens paid tickets, memberships, bookings, donations and your shop. Frequency takes ${RATE.business} on a customer the network introduces, once, and 0% on the people already yours. There's no network fee on ${keep}, only card processing.${extra} A free Space runs your page, contacts, bookings and events, and takes tips with no platform fee, plus card processing. You always see the full number, nothing hidden.`
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
    h1: "You're good with people. Keep the paperwork out of the way.",
    seoTitle: "Bookings and community gatherings for coaches and guides",
    subhead:
      "Share your sessions, take bookings and keep in touch with the people you meet. Give your community a place to find your next workshop.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    "Build community through sessions. Share dates and keep in touch with clients on Frequency. For coaches and guides. Start with your Space.",
  problem: {
    header: "You want to spend time with clients. There are bookings and follow-ups to handle too.",
    body: "Bookings in one tab, client notes in another, and follow-ups to write between sessions. Keep the details with your practice so you can find them before the next appointment.",
    caption: "Start with the next gathering.",
  },
  howItWorks: {
    header: "Put your next session on the calendar.",
    steps: [
      { title: "Describe your practice.", body: "Add your name, the sessions you offer and how clients can reach you." },
      { title: "Bring your contacts.", body: "Import client details or share your Frequency card after a conversation." },
      { title: "Open your calendar.", body: "Add your available times. Choose Business when you want clients to pay for sessions and packages." },
    ],
    caption: "Start with the next session.",
  },
  features: [
    {
      icon: "calendar",
      title: "Let clients choose a session.",
      body: "Share your available times. Clients can book from your page, and Business adds payment for sessions and packages.",
    },
    {
      icon: "contact",
      title: "Look back before you follow up.",
      body: "Keep client details and notes in Contacts. Import a list or scan a business card when you meet someone.",
    },
    {
      icon: "qr",
      title: "Share your practice after a conversation.",
      body: "Offer your Frequency card so someone can find your page and save your details. Invite them to a session or workshop.",
    },
    {
      icon: "spark",
      soft: true,
      title: "Write to a client you haven’t seen in a while.",
      body: "Choose people from Contacts and send a note about your next session or workshop. Use reminders for upcoming appointments.",
    },
  ],
  loop: {
    header: "Meet, remember, invite.",
    intro: "A conversation can lead to a session. Give the person you meet a way to find your practice.",
    payoff: "Share your card, let a client choose a time, and keep their details handy for your next conversation.",
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
    note: "Your plan subscription is separate from card processing and introduction fees. We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you're never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: "No. Start with your name and a gathering. Add the rest when you’re ready." },
    { q: 'What does it actually cost?', a: costAnswer('your own bookings') },
    { q: 'Where is Frequency available?', a: `Frequency opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}. You can open your Space before then, free, and it is ready when the town opens.` },
    { q: 'Can I take my contacts with me?', a: 'Yes, any time. Download a VCard or export your whole list.' },
    { q: 'Will my clients need to download anything?', a: 'No. They book and pay from a link.' },
    { q: 'What if I also run classes or events?', a: "It grows with you. The same Space handles memberships, tickets, and check-in when you're ready." },
    { q: 'Is my client information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: "Put your next session on the calendar.",
    subhead: "Share your practice, add your available times and let clients book from your page.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
  },
}

// ── Config #2: Studios (business:membership) ───────────────────────────────────────────────────────

const STUDIOS_FUNNEL: FunnelConfig = {
  slug: 'studios',
  niche: 'studios',
  archetypes: ['studio_keeper'],
  hero: {
    eyebrow: 'For studios and instructors',
    h1: "You teach the class. There are bookings and member messages to handle too.",
    seoTitle: "Classes and community for studios and instructors",
    subhead:
      "Share your schedule, greet people at the door and invite them to the next class. Give your studio community a place to find the details.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    "Build community through classes. Share dates and keep in touch with members on Frequency. For studios and instructors. Start with your Space.",
  problem: {
    header: "Teaching the class is one part of the day. Keeping up with bookings and member messages is another.",
    body: "Your schedule changes, someone needs a class pack, and you want to welcome a new member. Keep the class details and check-ins with your studio.",
    caption: "Start with the next gathering.",
  },
  howItWorks: {
    header: "Start with your studio and schedule.",
    steps: [
      { title: "Add your studio.", body: "Share your location, classes and schedule on your Space page." },
      { title: "Invite your members.", body: "Import your roster or share your page so members can find the class details." },
      { title: "Open your schedule.", body: "Take class bookings and check people in. Business adds paid memberships and class packs." },
    ],
    caption: "Start with the next class.",
  },
  features: [
    {
      icon: "calendar",
      title: "Let members book their class.",
      body: "Post your class schedule. On Business, offer memberships and class packs with recurring billing.",
    },
    {
      icon: "contact",
      title: "See who has been to class.",
      body: "Look at check-ins and member history before you write to someone. Find first visits and people you haven’t seen recently.",
    },
    {
      icon: "qr",
      title: "Greet people as they arrive.",
      body: "Put your QR code by the door and invite members to check in. Look for new names so you can welcome them.",
    },
    {
      icon: "spark",
      soft: true,
      title: "Send the next class invitation.",
      body: "Write to your members about a schedule change or a class you are running. Set reminders for upcoming gatherings.",
    },
  ],
  loop: {
    header: "Meet, remember, invite.",
    intro: "A class has a date, a place and people to welcome. Keep those details together.",
    payoff: "Share the schedule, take the booking, and check members in when they arrive. Use their names when you send the next class update.",
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
    note: 'Your plan subscription is separate from card processing and introduction fees. We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.',
  },
  faq: [
    { q: 'Do I need to be technical?', a: "No. Start with your name and a gathering. Add the rest when you’re ready." },
    { q: 'What does it actually cost?', a: costAnswer('the memberships you sell') },
    { q: 'Where is Frequency available?', a: `Frequency opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}. You can open your Space before then, free, and it is ready when the town opens.` },
    { q: 'Can I take my members with me?', a: 'Yes, any time. Export your whole member list whenever you want.' },
    { q: 'Will my members need to download anything?', a: 'No. They book and pay from a link, and check in with a QR code.' },
    { q: 'What if I also run workshops or events?', a: 'It grows with you. The same Space handles tickets, one-off workshops, and check-in when you’re ready.' },
    { q: 'Is my member information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: "Make a place for your studio community.",
    subhead: "Share your schedule, welcome members and keep a way to tell them about the next class.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
  },
}

// ── Config #3: Event hosts (business:ticketed) ───────────────────────────────────────────────────────

const EVENTS_FUNNEL: FunnelConfig = {
  slug: 'event-hosts',
  niche: 'hosts',
  archetypes: ['gathering_host'],
  hero: {
    eyebrow: 'For event hosts and organizers',
    h1: "A great gathering deserves a way to remember the people in it.",
    seoTitle: "Tickets and community events for local hosts",
    subhead:
      "Post your community gathering, offer tickets on Business and check guests in. Keep a way to invite people to your next date.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    "Build community through events. Share dates and keep in touch with guests on Frequency. For event hosts. Start with your Space.",
  problem: {
    header: "The night is over. You still need a way to reach the people who came.",
    body: "Tickets are in one place and the guest list is somewhere else. Keep the event details, check-in and contacts together before you announce the next date.",
    caption: "Start with the next gathering.",
  },
  howItWorks: {
    header: "From event details to the door.",
    steps: [
      { title: "Post the date.", body: "Add your event, venue and the details guests need before they come." },
      { title: "Open RSVPs or tickets.", body: "Offer free RSVPs on your Space, or choose Business to sell tickets." },
      { title: "Welcome guests.", body: "Use your QR code and guest list at the door, then keep a way to share the next event." },
    ],
    caption: "Start with the next event.",
  },
  features: [
    {
      icon: "calendar",
      title: "Sell a ticket from your event page.",
      body: "Set your date and capacity. Free RSVPs are available on your Space; Business adds paid tickets.",
    },
    {
      icon: "contact",
      title: "Look back at the guest list.",
      body: "Keep the people who checked in in Contacts. Use the list when you want to invite guests to another event.",
    },
    {
      icon: "qr",
      title: "Check tickets at the door.",
      body: "Invite guests to scan your QR code when they arrive. Use your guest list to check people in and handle walk-ins.",
    },
    {
      icon: "spark",
      soft: true,
      title: "Tell guests about the next date.",
      body: "Send an update to people who have gathered with you before. Include the date and a link to the next event.",
    },
  ],
  loop: {
    header: "Meet, remember, invite.",
    intro: "The next invitation starts with a way to reach past guests.",
    payoff: "Post the event, check guests in, then share your next date with people who came before.",
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
    note: 'Your plan subscription is separate from card processing and introduction fees. We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.',
  },
  faq: [
    { q: 'Do I need to be technical?', a: "No. Start with your name and a gathering. Add the rest when you’re ready." },
    { q: 'What does it actually cost?', a: costAnswer('the tickets you sell') },
    { q: 'Where is Frequency available?', a: `Frequency opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}. You can open your Space before then, free, and it is ready when the town opens.` },
    { q: 'Can I take my guest list with me?', a: 'Yes, any time. Export your whole list whenever you want.' },
    { q: 'Will my guests need to download anything?', a: 'No. They buy and check in from a link and a QR code.' },
    { q: 'What if I also run memberships or classes?', a: 'It grows with you. The same Space handles memberships and recurring classes when you’re ready.' },
    { q: 'Is my guest information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: "Share your next event.",
    subhead: "Add the date, offer free RSVPs, or sell tickets on Business, and tell guests what to expect.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
  },
}

// ── Config #4: Venues (business:ticketed; a room that hosts other people's gatherings, ADR-1863) ─────

const VENUES_FUNNEL: FunnelConfig = {
  slug: 'venues',
  niche: 'venues',
  archetypes: ['studio_keeper'],
  hero: {
    eyebrow: 'For venues and rooms that host',
    h1: "A home for every group that meets in your space.",
    seoTitle: "Community gatherings and calendars for venues",
    subhead:
      "Show the community groups that meet at your venue, share their dates and welcome guests at the door.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
    trustLine: '0% on your own audience, plus card processing.',
  },
  metaDescription:
    "Build community through gatherings. Share dates and keep in touch with guests on Frequency. For venues. Start with your Space.",
  problem: {
    header: "Different groups use your venue. Keeping track of their dates and guests takes work.",
    body: "A yoga group meets on Tuesday and a workshop arrives at the weekend. Give each host a place on your calendar and keep the arrival details easy to find.",
    caption: "Start with the next gathering.",
  },
  howItWorks: {
    header: "Give each gathering a place on your calendar.",
    steps: [
      { title: "Add your venue.", body: "Share your location, hours and the kinds of gatherings you host." },
      { title: "Bring the groups in.", body: "List the gatherings at your venue and link to each host." },
      { title: "Welcome people at the door.", body: "Invite guests to check in so you can look back at who came." },
    ],
    caption: "Start with the next gathering.",
  },
  features: [
    {
      icon: "calendar",
      title: "Show which groups meet at your venue.",
      body: "Put gatherings on your venue calendar, with each host linked to their own page. Guests can see the dates in one place.",
    },
    {
      icon: "qr",
      title: "Welcome guests at the door.",
      body: "Invite people to scan your QR code and check in. See who has arrived for the gathering.",
    },
    {
      icon: "contact",
      title: "Keep a way to reach your guests.",
      body: "Look back at the people who checked in at your venue. Send an invitation when you have another date to share.",
    },
    {
      icon: "calendar",
      soft: true,
      title: "Offer paid tickets and passes.",
      body: "On Business, sell tickets and passes for your venue. Guests who are already yours carry no network fee, only card processing.",
    },
  ],
  loop: {
    header: "Meet, remember, invite.",
    intro: "Different groups can share a venue without losing their own pages.",
    payoff: "Show each gathering on the venue calendar, welcome its guests and keep a way to invite people to another night.",
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
    note: 'Your plan subscription is separate from card processing and introduction fees. We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.',
  },
  faq: [
    { q: 'Do I need to be technical?', a: "No. Start with your name and a gathering. Add the rest when you’re ready." },
    { q: 'What does it actually cost?', a: costAnswer('the tickets and passes you sell') },
    { q: 'Where is Frequency available?', a: `Frequency opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}. You can open your Space before then, free, and it is ready when the town opens.` },
    { q: 'Do the groups that use my room need accounts?', a: 'Hosts do, and it is free. Their guests only need a link.' },
    { q: 'Can I take my list with me?', a: 'Yes, any time. Export your whole list whenever you want.' },
    { q: 'Is my guest information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: "Give local groups a place to gather.",
    subhead: "Add your venue, bring the hosts together on your calendar and share the dates with guests.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
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
    h1: "The people who believe in your work deserve to be known. We take no cut.",
    seoTitle: "Donations and community programs for Non Profits",
    subhead:
      "Give supporters a place to find your community programs and gatherings. Take donations on the Non Profit plan, with no network fee, plus card processing.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
    trustLine: 'No network fee on what you raise, plus card processing.',
  },
  metaDescription:
    "Build community through programs. Share dates and keep in touch with supporters on Frequency. For Non Profits. Start with your Space.",
  problem: {
    header: "Supporters care about your work. Keeping in touch between campaigns takes time.",
    body: "There are program sign-ups, donor records and updates to send. Keep supporters and their involvement with your organization so you can follow up between campaigns.",
    caption: "Start with the next gathering.",
  },
  howItWorks: {
    header: "Start with your work and your supporters.",
    steps: [
      { title: "Share your organization.", body: "Describe your work and add the programs people can join." },
      { title: "Bring your supporters.", body: "Import your supporter list or share your Frequency card after a conversation." },
      { title: "Open donations.", body: "Verify your 501(c)(3) status to take one-time and recurring gifts on the Non Profit plan." },
    ],
    caption: "Start with the next program.",
  },
  features: [
    {
      icon: "spark",
      title: "Offer one-time and recurring giving.",
      body: "On the Non Profit plan, take donations and keep donor details with your supporter contacts. Verified 501(c)(3) organizations pay no network fee on donations, only card processing.",
    },
    {
      icon: "calendar",
      title: "Let people enroll in your programs.",
      body: "Share a program on your page and take sign-ups there. Use check-in when your group meets in person.",
    },
    {
      icon: "qr",
      title: "Share your work after a conversation.",
      body: "Offer your Frequency card so someone can find your programs and ways to support them. Keep a way to follow up.",
    },
    {
      icon: "spark",
      soft: true,
      title: "Keep supporters informed between campaigns.",
      body: "Send a note about your work, a program date or the next appeal. Keep receipts and recurring-gift reminders with your donation records.",
    },
  ],
  loop: {
    header: "Meet, remember, invite.",
    intro: "A supporter might give, join a program or share your work. Make each next step clear.",
    payoff: "Share your programs and ways to give, record the support you receive, then send a note about what’s happening next.",
  },
  pricing: {
    header: 'Free to start. Nothing taken on what you raise.',
    intro: 'Start free, and host free while you grow. Donations open on the Non Profit plan, flat and never per seat, for verified 501(c)(3) organizations, with no network fee on what you raise.',
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'nonprofit', name: 'Non Profit', detail: '0% on what you raise', featured: true },
      { kind: 'resonance', name: '+ Vera AI', detail: 'AI that works for you' },
    ],
    breakEvenCaption: 'No network fee on what you raise, only card processing. Verified 501(c)(3) organizations pay no network take-rate on the Non Profit plan.',
    note: 'We never take a share of your donations. Your supporters export any time, so you are never locked in.',
  },
  faq: [
    { q: 'Do I need to be technical?', a: "No. Start with your name and a gathering. Add the rest when you’re ready." },
    { q: 'What does it actually cost?', a: `${PLAN_STORY.crewSpace} Taking donations is the Non Profit plan, ${P.nonprofit} a month flat, never per seat, for verified 501(c)(3) organizations, and there is no network fee on what you raise. You always see the full number, nothing hidden.` },
    { q: 'Where is Frequency available?', a: `Frequency opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}. You can open your Space before then, free, and it is ready when the town opens.` },
    { q: 'Do you take a cut of donations?', a: 'No. We never take a share of a donation. Card processing is the only fee on a gift, and it goes to the card processor, not to us.' },
    { q: 'Can I take my supporters with me?', a: 'Yes, any time. Export your whole supporter list whenever you want.' },
    { q: 'How do we get the Non Profit plan?', a: 'Verify your 501(c)(3) status and the flat Non Profit plan opens, with the full toolkit and donations built in.' },
    { q: 'Is my supporter information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: "Make a place for the people behind your work.",
    subhead: "Share your programs, keep in touch with supporters and offer donations on the Non Profit plan.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
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
    h1: "Every chapter is its own circle. Keep them connected.",
    seoTitle: "Community chapters and shared calendars for networks",
    subhead:
      "Give each chapter a place to share its gatherings, with a Network calendar where people can find community events across locations.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
    trustLine: 'Each chapter runs on its own Space.',
  },
  metaDescription:
    "Build community through chapters. Share dates and keep in touch with members on Frequency. For network leaders. Start with your Space.",
  problem: {
    header: "Your chapters meet in different places. It takes work to keep everyone informed.",
    body: "Each chapter has its own leaders and calendar. Bring the dates together while letting chapter leaders manage their own gatherings.",
    caption: "Start with the next gathering.",
  },
  howItWorks: {
    header: "Give each chapter its own place.",
    steps: [
      { title: "Create the network home.", body: "Describe your organization and the chapters it brings together." },
      { title: "Add your chapters.", body: "Give each chapter its own Space, page and calendar." },
      { title: "Invite chapter leaders.", body: "Let leaders run their chapters while central admins see the network together." },
    ],
    caption: "Start with your chapter list.",
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
      title: 'A shared site for every chapter.',
      body: 'Each chapter can have its own website, billed to the Network. Pricing is on the pricing page.',
    },
    {
      icon: 'spark',
      soft: true,
      title: 'One report across the network.',
      body: 'Who came, where, and how it is growing, for every chapter in one view.',
    },
  ],
  loop: {
    header: "Meet, remember, invite.",
    intro: "Chapters can share a network home while keeping their local calendars.",
    payoff: "Add a chapter, invite its leaders and show its dates on the network calendar. Central admins can look across the chapters together.",
  },
  pricing: {
    header: 'Start free. Add the Network when you’re ready.',
    intro: pricingIntro('When your chapters start charging, each one is Business.'),
    rows: [
      { kind: 'free', name: 'Free', detail: FREE_ROW_DETAIL },
      { kind: 'network', name: 'Network', detail: NETWORK_ROW_DETAIL, featured: true },
    ],
    breakEvenCaption: breakEvenCaption('what your chapters sell to their own people'),
    note: 'The Network plan joins your chapters under one home. Its price is on the pricing page, and you always see the full number.',
  },
  faq: [
    { q: 'Do I need all my chapters to start?', a: 'You can plan your chapter list before setting up the Network. Check the Network plan on the pricing page for included chapters and minimums.' },
    { q: 'What does it cost?', a: costAnswer('what your chapters sell') },
    { q: 'Where is Frequency available?', a: `Frequency opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}. You can open your Space before then, free, and it is ready when the town opens.` },
    { q: 'Can a chapter leave with its people?', a: 'Yes. Contacts export any time, so nothing is locked in.' },
    { q: 'Is member information private?', a: 'Yes. Contacts are held securely and never sold.' },
  ],
  finalCta: {
    header: "Keep your chapters connected.",
    subhead: "Give chapter leaders their own Spaces, share the network calendar and see your organization together.",
    microcopy: 'No card. A Space comes with Crew, and you pay when you start charging.',
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
  const destination = funnelStartDestination(config)
  return destination?.mode === 'direct' ? destination.url : FUNNEL_START_FALLBACK_HREF
}
