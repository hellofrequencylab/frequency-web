// Personas — WHO is arriving, self-identified (ADR-125, docs/LEAD-FLOWS.md).
//
// The spine of the intake rework. A persona is the one answer we ask for up front
// ("who are you?") and then carry everywhere: it routes the lead-flow marketing
// track (lib/onboarding/lead-flows.ts), branches the induction's value reel, and
// is stamped on the member (meta.persona + a registered tag) so the site and Vera
// can tailor the experience forever — long after the beta induction is removed.
//
// Client-safe (no server imports). The marketing tag for each persona MUST be
// registered in lib/traits/registry.ts (assignTag throws on unknown keys).

import { REEL, type ReelSlide } from '@/lib/onboarding/beta-script'

export type PersonaId = 'visitor' | 'practitioner' | 'partner' | 'builder' | 'investor'

/** Display order in the picker — Visitor first (the default), then the offerings. */
export const PERSONA_ORDER: PersonaId[] = ['visitor', 'practitioner', 'partner', 'builder', 'investor']

export const DEFAULT_PERSONA: PersonaId = 'visitor'

/** The marketing track a persona is routed to — what we *show* them and where
 *  "Learn more" points (an existing pillar page for now; dedicated track pages
 *  are future work, see ADR-125). */
export interface PersonaTrack {
  /** One-line promise on the lead-flow card + the induction payoff. */
  headline: string
  /** The three things we show this persona (their marketing track, in plain words). */
  shows: [string, string, string]
  learnMoreHref: string
  learnMoreLabel: string
}

export interface Persona {
  id: PersonaId
  /** Noun for admin/analytics + the picker card ("Practitioner"). */
  label: string
  /** First-person identity line in the picker ("I have something to offer"). */
  pitch: string
  emoji: string
  /** Stamped on the member at induction — register it in lib/traits/registry.ts. */
  marketingTag: string
  /** The value reel shown in the induction tour for this persona (reuses the three
   *  product renders with persona-true captions). */
  reel: ReelSlide[]
  /** The marketing track this persona is routed to. */
  track: PersonaTrack
}

// ── Visitor / regular member (the default fall-through) ──────────────────────
const VISITOR: Persona = {
  id: 'visitor',
  label: 'Just here to belong',
  pitch: 'I want to find my people',
  emoji: '🧍',
  marketingTag: 'persona_visitor',
  // The visitor sees the original product reel (feed · circles · events) verbatim.
  reel: REEL,
  track: {
    headline: 'Find your people.',
    shows: [
      'A local circle built around what you love',
      'Real gatherings, in person — not another feed',
      'A say in what the community becomes',
    ],
    learnMoreHref: '/the-community',
    learnMoreLabel: 'See the community',
  },
}

// ── Practitioner — has something to offer (hosts + builds programs, sells) ────
const PRACTITIONER: Persona = {
  id: 'practitioner',
  label: 'Practitioner',
  pitch: 'I have something to offer',
  emoji: '🛠️',
  marketingTag: 'persona_practitioner',
  reel: [
    { kind: 'render', render: 'feed', title: 'Host your programs', line: 'Spin up a program in minutes and fill it with the people nearby who want exactly what you do.' },
    { kind: 'render', render: 'circles', title: 'Build a following', line: 'Turn one-off attendees into a circle that comes back — your people, your craft, your cadence.' },
    { kind: 'render', render: 'events', title: 'The worldwide marketplace', line: 'List your sessions and offerings on a marketplace that reaches seekers far past your zip code.' },
  ],
  track: {
    headline: 'Turn your craft into a community.',
    shows: [
      'Host & build programs in minutes',
      'Grow a following that comes back',
      'Reach seekers on the worldwide marketplace',
    ],
    learnMoreHref: '/the-quest',
    learnMoreLabel: 'See the path',
  },
}

// ── Partner business — a local spot (loyalty rewards + gamified foot traffic) ─
const PARTNER: Persona = {
  id: 'partner',
  label: 'Partner business',
  pitch: 'I run a local spot',
  emoji: '🏪',
  marketingTag: 'persona_partner',
  reel: [
    { kind: 'render', render: 'feed', title: 'Reward your regulars', line: 'A loyalty program that turns first-timers into regulars — points, perks, and real reasons to come back.' },
    { kind: 'render', render: 'circles', title: 'Gamified foot traffic', line: 'Quests and challenges that send the community through your doors, not past them.' },
    { kind: 'render', render: 'events', title: 'Show up on the map', line: 'Get discovered by everyone nearby looking for somewhere real to go tonight.' },
  ],
  track: {
    headline: 'Make your place the place.',
    shows: [
      'A loyalty rewards program for your regulars',
      'Gamified quests that drive foot traffic',
      'Discovery by everyone gathering nearby',
    ],
    learnMoreHref: '/the-lab',
    learnMoreLabel: 'See the Lab',
  },
}

// ── Community builder / volunteer — wants to help build + grow it ─────────────
const BUILDER: Persona = {
  id: 'builder',
  label: 'Community builder',
  pitch: 'I want to help build it',
  emoji: '🤝',
  marketingTag: 'persona_builder',
  reel: [
    { kind: 'render', render: 'feed', title: 'Help it grow', line: 'Welcome newcomers, seed the first circles, and keep the pulse alive where you are.' },
    { kind: 'render', render: 'circles', title: 'Lead a circle', line: 'Start the room you wish existed and gather the people around it.' },
    { kind: 'render', render: 'events', title: 'Make things happen', line: 'Host the gatherings that turn a feed into a real-world community.' },
  ],
  track: {
    headline: 'Build the community you wish existed.',
    shows: [
      'Lead a circle and gather your people',
      'Welcome newcomers as crew',
      'Earn your way to guide of your area',
    ],
    learnMoreHref: '/the-community',
    learnMoreLabel: 'See the community',
  },
}

// ── Investor / Lab champion — wants a Frequency Lab in their town ─────────────
const INVESTOR: Persona = {
  id: 'investor',
  label: 'Lab champion',
  pitch: 'I want a Frequency Lab in my town',
  emoji: '💡',
  marketingTag: 'persona_investor',
  reel: [
    { kind: 'render', render: 'events', title: 'A Lab in your town', line: 'Bring Frequency’s home base — The Lab — to your city, and anchor a real community around it.' },
    { kind: 'render', render: 'circles', title: 'Ground-floor partner', line: 'Shape where this goes with a real voice, early access, and your name on the foundation.' },
    { kind: 'render', render: 'feed', title: 'Build the movement', line: 'Back the places and gatherings that make local community real again.' },
  ],
  track: {
    headline: 'Bring Frequency to your town.',
    shows: [
      'A Frequency Lab anchored in your city',
      'A real voice in where this goes',
      'Ground-floor partner — your name on the foundation',
    ],
    learnMoreHref: '/the-lab',
    learnMoreLabel: 'See the Lab',
  },
}

export const PERSONAS: Record<PersonaId, Persona> = {
  visitor: VISITOR,
  practitioner: PRACTITIONER,
  partner: PARTNER,
  builder: BUILDER,
  investor: INVESTOR,
}

/** True for any of the five known persona ids. */
export function isPersonaId(value: string | null | undefined): value is PersonaId {
  return !!value && value in PERSONAS
}

/** Resolve a persona by id, falling back to the default (visitor). */
export function getPersona(id: string | null | undefined): Persona {
  return isPersonaId(id) ? PERSONAS[id] : PERSONAS[DEFAULT_PERSONA]
}

/** Personas in picker order. */
export function listPersonas(): Persona[] {
  return PERSONA_ORDER.map((id) => PERSONAS[id])
}

/** The registered marketing tag for a persona id (or null if unknown). */
export function personaTag(id: string | null | undefined): string | null {
  return isPersonaId(id) ? PERSONAS[id].marketingTag : null
}
