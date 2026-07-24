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
import { spaceCreatePath, type FunnelDestination } from '@/lib/onboarding/beta-sequences'

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
  /** The plan name shown, e.g. "Free", "Business", "+ Resonance". */
  name: string
  /** The right-hand descriptor, e.g. "10% on network sales", "5% on network sales", "AI that works for you". */
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
  tagline: 'The community collective.',
  links: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Contact', href: 'mailto:hello@frequencylocal.com' },
  ],
} as const

// ── Config #1: Coaches & Healers (the reference build) ─────────────────────────────────────────────

export const COACHES_FUNNEL: FunnelConfig = {
  // Canonical persona slug (ADR-590): the /for door, the pricing "by who you are" strip, and the persona
  // registry all speak ONE slug vocabulary now, so the strip card lands here instead of 404ing.
  slug: 'coaches-and-healers',
  mode: { type: 'business', variant: 'packages' },
  hero: {
    eyebrow: 'For coaches, healers, and guides',
    h1: 'Your practice, made perfect.',
    seoTitle: 'Booking + contacts software for coaches and healers',
    subhead:
      "Bookings, payments, and every person you've met, together in one place. Frequency keeps your relationships close, so the people you meet come back, and bring the next ones. Start free.",
    microcopy: 'No card. Free while you grow.',
    trustLine: 'You keep 100% of what you bring in.',
  },
  metaDescription:
    'Frequency gives coaches and healers bookings, payments, and one contact list in one place, so clients rebook and refer. Free to start, no card.',
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
      { title: 'Open your calendar.', body: 'Take bookings and payments the same day, right from the page clients already see.' },
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
      { kind: 'free', name: 'Free', detail: '10% on network sales' },
      { kind: 'business', name: 'Business', detail: '5% on network sales', featured: true },
      { kind: 'resonance', name: '+ Resonance', detail: 'AI that works for you' },
    ],
    breakEvenCaption:
      'You keep 100% of the bookings you bring in yourself. Business halves the rate on the business the network sends you.',
    note: "We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you're never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most practitioners are taking bookings the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: 'Free to start. Business is $29 a month, and you keep 100% of your own bookings. We earn only on business the network sends you, at a rate that drops as your plan rises. You always see the full number, nothing hidden.',
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

// ── Config #2: Studios (business:membership) ───────────────────────────────────────────────────────

export const STUDIOS_FUNNEL: FunnelConfig = {
  slug: 'studios',
  mode: { type: 'business', variant: 'membership' },
  hero: {
    eyebrow: 'For studios and class-based spaces',
    h1: 'Every class, every member, one place.',
    seoTitle: 'Membership + class booking software for studios',
    subhead:
      "Recurring classes, memberships, and check-in at the door, together in one place. Frequency keeps your members close, so the regulars come back and bring the next ones. Start free.",
    microcopy: 'No card. Free while you grow.',
    trustLine: 'You keep 100% of what you bring in.',
  },
  metaDescription:
    'Frequency gives studios recurring classes, memberships, and door check-in in one place, so members rebook and refer. Free to start, no card.',
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
      { title: 'Open your schedule.', body: 'Sell memberships and class packs, and check people in at the door the same day.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  features: [
    {
      icon: 'calendar',
      title: 'Classes and memberships, billed on time.',
      body: 'Sell memberships and class packs with recurring billing. Members book their own spots, and payments run themselves.',
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
      title: 'When you are ready, it does more.',
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
    intro: 'Start free, and stay free while you grow. When your studio fills, one plan opens everything. No add-on menu, no surprise fees.',
    rows: [
      { kind: 'free', name: 'Free', detail: '10% on network sales' },
      { kind: 'business', name: 'Business', detail: '5% on network sales', featured: true },
      { kind: 'resonance', name: '+ Resonance', detail: 'AI that works for you' },
    ],
    breakEvenCaption:
      'You keep 100% of the memberships you sell yourself. Business halves the rate on the business the network sends you.',
    note: "We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most studios are taking bookings the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: 'Free to start. Business is $29 a month, and you keep 100% of the memberships you sell. We earn only on business the network sends you, at a rate that drops as your plan rises. You always see the full number, nothing hidden.',
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
    microcopy: 'No card. Free while you grow.',
  },
}

// ── Config #3: Event hosts (business:ticketed) ───────────────────────────────────────────────────────

export const EVENTS_FUNNEL: FunnelConfig = {
  slug: 'event-hosts',
  mode: { type: 'business', variant: 'ticketed' },
  hero: {
    eyebrow: 'For event hosts and organizers',
    h1: 'Sell the tickets. Keep the room.',
    seoTitle: 'Ticketing + check-in software for event hosts',
    subhead:
      'Tickets, check-in, and everyone who has one, together in one place. Frequency keeps the people who showed up, so your next event fills from the last. Start free.',
    microcopy: 'No card. Free while you grow.',
    trustLine: 'You keep 100% of what you bring in.',
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
      { title: 'Make your Space.', body: 'Your event page, your dates, and your tickets, ready in a few minutes. Free to start, always.' },
      { title: 'Sell your tickets.', body: 'Take payments from the page guests already see. Every buyer lands in Contacts.' },
      { title: 'Open the door.', body: 'Check people in with a QR code, and keep everyone who came for the next one.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  features: [
    {
      icon: 'calendar',
      title: 'Tickets sold, straight from your page.',
      body: 'Sell tickets and passes from your Space. Guests pick a ticket and pay up front, and the money is yours.',
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
      title: 'When you are ready, it does more.',
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
    intro: 'Start free, and stay free while you grow. When your events take off, one plan opens everything. No add-on menu, no surprise fees.',
    rows: [
      { kind: 'free', name: 'Free', detail: '10% on network sales' },
      { kind: 'business', name: 'Business', detail: '5% on network sales', featured: true },
      { kind: 'resonance', name: '+ Resonance', detail: 'AI that works for you' },
    ],
    breakEvenCaption:
      'You keep 100% of the tickets you sell yourself. Business halves the rate on the business the network sends you.',
    note: "We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most hosts are selling tickets the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: 'Free to start. Business is $29 a month, and you keep 100% of the tickets you sell. We earn only on business the network sends you, at a rate that drops as your plan rises. You always see the full number, nothing hidden.',
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
    microcopy: 'No card. Free while you grow.',
  },
}

// ── Config #4: Community builders (business:cohort; the Loop is the product, so it runs prominent) ────

export const COMMUNITY_FUNNEL: FunnelConfig = {
  slug: 'community-builders',
  mode: { type: 'business', variant: 'cohort' },
  loopProminent: true,
  hero: {
    eyebrow: 'For community builders and organizers',
    h1: 'Hold the community. Connect the people.',
    seoTitle: 'Membership + community software for organizers',
    subhead:
      'Circles, memberships, and the right introductions, together in one place. Frequency holds your community, so members stay and bring the people who belong here next. Start free.',
    microcopy: 'No card. Free while you grow.',
    trustLine: 'You keep 100% of what you bring in.',
  },
  metaDescription:
    'Frequency gives community builders Circles, memberships, and a member CRM in one place, and connects the right people to each other. Free to start, no card.',
  problem: {
    header: 'The community is real. The tools pull it apart.',
    body: 'Members live in a chat app, the sign-ups in a form, and the notes on who knows who only in your head. The two people who should meet never do, and a quiet member drifts off before anyone notices. The connection is the whole point, and the tools get in its way.',
    caption: 'One community, five apps.',
  },
  howItWorks: {
    header: 'One place. Ready before your next gathering.',
    steps: [
      { title: 'Make your Space.', body: 'Your community page, your Circles, and your memberships, ready in a few minutes. Free to start, always.' },
      { title: 'Bring your people in.', body: 'Import your list or share your Frequency card. Everyone lands in Contacts.' },
      { title: 'Open your Circles.', body: 'Run memberships and cohorts, and let the right members find each other.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  features: [
    {
      icon: 'contact',
      title: 'Circles, cohorts, and memberships, in one place.',
      body: 'Run standing Circles and cohorts with memberships and recurring billing, and keep a member list that knows who is who.',
    },
    {
      icon: 'spark',
      title: 'The right people, introduced.',
      body: 'The Resonance Engine reads your community signals and turns them into live matches, so the two members who should meet actually do.',
    },
    {
      icon: 'qr',
      title: 'Your community grows through the members you have.',
      body: 'Share your Frequency card and every hello becomes a saved contact, and an invitation in. The member who feels at home brings the next person who belongs here.',
    },
    {
      icon: 'envelope',
      soft: true,
      title: 'When you are ready, it does more.',
      body: 'Email to bring quiet members back, reminders that send themselves, and a nudge when someone is drifting.',
    },
  ],
  loop: {
    header: 'Every member, an open door.',
    intro: 'This is how a community grows here. Not through ads, but through the members who already belong.',
    payoff: 'A member joins, feels at home, and invites the next person who belongs here. They stay, and they bring the ones after them.',
  },
  pricing: {
    header: 'One honest price.',
    intro: 'Start free, and stay free while you grow. When your community grows a team, one plan opens everything. No add-on menu, no surprise fees.',
    rows: [
      { kind: 'free', name: 'Free', detail: '10% on network sales' },
      { kind: 'business', name: 'Business', detail: '5% on network sales', featured: true },
      { kind: 'resonance', name: '+ Resonance', detail: 'AI that works for you' },
    ],
    breakEvenCaption:
      'You keep 100% of the memberships you sell yourself. Business halves the rate on the business the network sends you.',
    note: "We earn only on what the network sends you, and you always see the full number. Your contacts export any time, so you are never locked in.",
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most organizers have their community running the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: 'Free to start. Business is $29 a month, and you keep 100% of the memberships you sell. We earn only on business the network sends you, at a rate that drops as your plan rises. You always see the full number, nothing hidden.',
    },
    { q: 'Can I take my members with me?', a: 'Yes, any time. Export your whole member list whenever you want.' },
    {
      q: 'How does it connect the right people?',
      a: 'The Resonance Engine reads your community signals and suggests introductions. It is optional, has a 14-day trial, and you can turn it on or off anytime.',
    },
    { q: 'Will my members need to download anything?', a: 'No. They join, book, and pay from a link.' },
    { q: 'Is my member information private?', a: 'Yes. Your contacts are yours, held securely, never sold.' },
  ],
  finalCta: {
    header: 'Hold your community in one place.',
    subhead: 'Your Circles, your memberships, and every member, held together, with the right people introduced. Start free, and grow through the people who belong here.',
    microcopy: 'No card. Free while you grow.',
  },
}

// ── Config #5: Nonprofits (nonprofit:donations; the assurance bar + pricing swap to the Non Profit plan) ─

export const NONPROFITS_FUNNEL: FunnelConfig = {
  slug: 'nonprofits',
  mode: { type: 'nonprofit', variant: 'donations' },
  nonprofit: true,
  hero: {
    eyebrow: 'For nonprofits and 501(c)(3) organizations',
    h1: 'Raise more. Keep all of it.',
    seoTitle: 'Donations + supporter software for nonprofits',
    subhead:
      'Donations, supporters, and your programs, together in one place. Frequency holds your supporters, so giving repeats and the word travels to the next donor. Start free.',
    microcopy: 'No card. Free while you grow.',
    trustLine: 'No take-rate on what you raise, ever.',
  },
  metaDescription:
    'Frequency gives nonprofits donations, a supporter CRM, and program enrollment in one place, with no take-rate on what you raise. Free to start, no card.',
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
      { title: 'Open donations.', body: 'Take one-time and recurring gifts, and enroll people in your programs the same day.' },
    ],
    caption: 'Set up in an afternoon, not a weekend.',
  },
  features: [
    {
      icon: 'contact',
      title: 'Donations and a supporter list, together.',
      body: 'Take one-time and recurring gifts, and keep a supporter list that tracks every donor and flags who has lapsed.',
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
      title: 'When you are ready, it does more.',
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
    intro: 'Start free, and stay free while you grow. Verified 501(c)(3) organizations run the Non Profit plan, flat and never per seat, with no take-rate on what you raise.',
    rows: [
      { kind: 'free', name: 'Free', detail: 'Everything to start' },
      { kind: 'nonprofit', name: 'Non Profit', detail: '0% on what you raise', featured: true },
      { kind: 'resonance', name: '+ Resonance', detail: 'AI that works for you' },
    ],
    breakEvenCaption:
      'You keep 100% of what you raise. Verified 501(c)(3) organizations pay no network take-rate on the Non Profit plan.',
    note: 'We never take a share of your donations. Your supporters export any time, so you are never locked in.',
  },
  faq: [
    { q: 'Do I need to be technical?', a: 'No. Most organizations are taking donations the same afternoon.' },
    {
      q: 'What does it actually cost?',
      a: 'Free to start. The Non Profit plan is $39 a month flat, never per seat, for verified 501(c)(3) organizations, and there is no take-rate on what you raise. You always see the full number, nothing hidden.',
    },
    { q: 'Do you take a cut of donations?', a: 'No. You keep 100% of what you raise. We never take a share of a donation.' },
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
    microcopy: 'No card. Free while you grow.',
  },
}

// ── The registry (ADR-591): one config per persona door, keyed by the SAME canonical slug the pricing
// "by who you are" strip and the persona registry use, so every strip card lands on a real, on-topic page
// (never a 404). Adding a door = one config + one row here. ────────────────────────────────────────────
export const FUNNEL_CONFIGS: Record<string, FunnelConfig> = {
  'coaches-and-healers': COACHES_FUNNEL,
  studios: STUDIOS_FUNNEL,
  'event-hosts': EVENTS_FUNNEL,
  'community-builders': COMMUNITY_FUNNEL,
  nonprofits: NONPROFITS_FUNNEL,
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

/** Where a finished operator from THIS niche funnel is admitted: Create-a-Space pre-seeded in the niche's
 *  Mode (OPERATOR-FUNNELS §5 Start-free bridge), NOT the general Beta list. Derived from the config's own
 *  `mode`, so it is one data edit per niche and can never drift from the niche's Space Mode. The onboarding
 *  side (NICHE_FUNNEL_DESTINATIONS in beta-sequences) points at the SAME spaceCreatePath. Re-validated at
 *  redirect time by isSafeInAppPath / funnelLanding. PURE. */
export function funnelStartDestination(config: FunnelConfig): FunnelDestination {
  return { mode: 'direct', url: spaceCreatePath(config.mode) }
}
