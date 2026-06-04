// Beta sequences — audience-targeted variants of the induction (ADR-068 vibe).
// Each "sequence" is a splash + the induction's voiced copy, tuned to WHO is
// arriving, plus a marketing tag stamped on the member so cohorts are segmentable
// forever. The induction template already accepts a `copy` override; a sequence
// just feeds it. TEMPORARY (deleted at launch) like the rest of beta-script.
//
// Client-safe (no server imports). The splash-page creator (/admin/beta-sequences)
// reads/lists these; a DB-backed editable layer can override them later (vera_config
// pattern) without changing callers.

import { VERA, BETA_OATHS, HEARD_ABOUT, type OathId, type VeraCopy } from '@/lib/onboarding/beta-script'

export interface SequenceSplash {
  /** Small kicker above the headline. */
  eyebrow: string
  headline: string
  body: string
  /** Primary CTA into the induction. */
  cta: string
  /** Full-bleed hero image behind the splash (public/ path). */
  image: string
  imageAlt: string
  /** A short interstitial line under the hero — wrap the accent word in *asterisks*. */
  statement: string
}

export interface BetaSequence {
  slug: string
  /** Human label for the audience (admin + analytics). */
  audience: string
  /** Tag stamped on members who arrive via this sequence — segment them forever. */
  marketingTag: string
  /** The public splash page copy. */
  splash: SequenceSplash
  /** The induction's voiced copy (Vera's HOT register). Reuses the base VERA shape;
   *  sequences override the audience-specific beats (oath + intro) and reuse the rest. */
  vera: VeraCopy
  oaths: { id: OathId; label: string }[]
  heardAbout: string[]
}

// ── 1. Early adopters (the original) — followers who saw the video and want in. ──
const EARLY_ADOPTER: BetaSequence = {
  slug: 'early-adopter',
  audience: 'Early adopters (video)',
  marketingTag: 'beta_early_adopter',
  splash: {
    eyebrow: 'You found us early',
    headline: "You're not a user. You're a Founder.",
    body: 'You came for what you saw — a place to turn the people near you into real community. It’s live, it’s raw, and the first few hundred people shape what it becomes. Be one of them.',
    cta: 'Claim your spot',
    image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
    imageAlt: 'A Frequency community dancing together outdoors at golden hour, arms raised',
    statement: 'Everyone else waits for *polished*. You’re here while it’s raw.',
  },
  vera: VERA,
  oaths: BETA_OATHS,
  heardAbout: [...HEARD_ABOUT],
}

// ── 2. Personal invite from Daniel Tyack — into the dream, asking for help. ──────
const PERSONAL: BetaSequence = {
  slug: 'personal',
  audience: 'Daniel’s personal invites',
  marketingTag: 'beta_personal',
  splash: {
    eyebrow: 'A personal invite',
    headline: 'I built this for people like you.',
    body: 'It’s Daniel. I’ve spent a long time quietly building Frequency — a way to turn the people near you into your actual community. It’s real now, but rough, and I want your eyes on it before anyone else’s. Come help me get it right.',
    cta: 'I’m in, Daniel',
    image: '/images/site/community-1.jpg',
    imageAlt: 'A small group of friends gathered close together, talking and laughing',
    statement: 'I’m not handing you a product. I’m handing you the *keys*.',
  },
  vera: {
    ...VERA,
    oath: {
      eyebrow: 'Before you come in',
      heading: 'This one’s personal.',
      body: 'I’m not handing you a finished product — I’m handing you the keys while the paint’s still wet. Break it, tell me what’s off, help me shape it. That’s the whole deal, and it means a lot that you’re here.',
      cta: 'I’m in',
    },
    intro: {
      eyebrow: 'Welcome, friend',
      heading: 'You’re not a tester. You’re a co-builder.',
      body: 'I asked you here because I trust your taste and I want your honesty. What you do in the next few minutes literally shapes the room everyone else walks into. Let’s build it together.',
      cta: 'Let’s go',
    },
  },
  oaths: BETA_OATHS,
  heardAbout: ['Daniel invited me', ...HEARD_ABOUT],
}

// ── 3. Founding Partners — collaborators + businesses who want the Founder energy. ─
const FOUNDING_PARTNER: BetaSequence = {
  slug: 'founding-partner',
  audience: 'Founding Partners',
  marketingTag: 'beta_founding_partner',
  splash: {
    eyebrow: 'Founding Partners',
    headline: 'Get in on the ground floor.',
    body: 'Frequency is building the connective tissue for real-world local community. The builders and businesses who help shape it now become its Founding Partners — early access, a real voice in where this goes, and your name on the foundation everyone else will stand on.',
    cta: 'Become a Founding Partner',
    image: '/images/site/lab-concept.jpg',
    imageAlt: 'A bright, welcoming community space designed for people to gather and build together',
    statement: 'The people who shape a place are the ones it’s *built around*.',
  },
  vera: {
    ...VERA,
    oath: {
      eyebrow: 'Before we build together',
      heading: 'Partners, not vendors.',
      body: 'This is an invitation to help build the thing, not just use it. We move fast, we break things on purpose, and we tell each other the truth. If that’s your energy, you’re exactly who we’re looking for.',
      cta: 'Let’s build',
    },
    intro: {
      eyebrow: 'Welcome, Founding Partner',
      heading: 'You’re not a customer. You’re a Founding Partner.',
      body: 'The people who shape a place in its first days are the ones it’s built around. Bring your community, your craft, your business — and help lay the foundation. We’ll make sure it’s worth your name.',
      cta: 'Let’s go',
    },
  },
  oaths: [
    { id: 'unfinished', label: 'I’ll help shape it, not just use it' },
    { id: 'report', label: 'I’ll tell you the hard truths' },
    { id: 'build', label: 'I’m here to build the foundation' },
  ],
  heardAbout: ['A founder or the team', 'A partner or collaborator', ...HEARD_ABOUT],
}

export const BETA_SEQUENCES: Record<string, BetaSequence> = {
  'early-adopter': EARLY_ADOPTER,
  personal: PERSONAL,
  'founding-partner': FOUNDING_PARTNER,
}

export const DEFAULT_SEQUENCE = 'early-adopter'

/** Resolve a sequence by slug, falling back to the default (early adopter). */
export function getSequence(slug: string | null | undefined): BetaSequence {
  return (slug && BETA_SEQUENCES[slug]) || BETA_SEQUENCES[DEFAULT_SEQUENCE]
}

export function listSequences(): BetaSequence[] {
  return Object.values(BETA_SEQUENCES)
}
