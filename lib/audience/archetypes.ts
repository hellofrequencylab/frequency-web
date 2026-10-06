// The archetype registry (ADR-1715, LIVE-795). ONE source for the eleven archetypes in
// docs/CONTENT-VOICE.md §2d and §2f: each one's data id, family, reader and funnel, and the
// arrival follow-up that maps a persona pick to an archetype. Every other file reads from here.
//
// PURE and import-free, so the induction (client), the server actions, the trait registry and the
// AI layer can all read it without dragging anything along.
//
// 🔴 Archetype names are INTERNAL (CONTENT-VOICE §2g). They are for planning, analytics, segments
// and AI prompts. The follow-up OPTIONS below are in members' own words and never name an
// archetype; `name` is never rendered to a member, and `pnpm check:canon` fails if one leaks into
// member copy. The archetype is never sent to an ad or analytics pixel, never shown to the member,
// and never placed in an email, a profile or a public page. This release collects no age or gender.

export type ArchetypeId =
  | 'wired_professional'
  | 'transplant'
  | 'activity_first'
  | 'evidence_first'
  | 'host_connector'
  | 'gathering_host'
  | 'mission_patron'
  | 'portfolio_teacher'
  | 'second_act'
  | 'studio_keeper'
  | 'network_steward'

export type ArchetypeFamily = 'seekers' | 'latent_leaders' | 'supporter' | 'builders'
export type ArchetypeReader = 'seeker' | 'leader' | 'builder'

export interface Archetype {
  id: ArchetypeId
  /** Internal name (CONTENT-VOICE §2d / §2f). Never member-facing. */
  internalName: string
  family: ArchetypeFamily
  /** The reader copy for this archetype is written to (withVoice's reader hint uses the same three). */
  reader: ArchetypeReader
  /** The funnel(s) this archetype is routed into, by name. */
  funnel: string
}

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  wired_professional: { id: 'wired_professional', internalName: 'Wired Professional', family: 'seekers', reader: 'seeker', funnel: 'Calm down fast' },
  transplant: { id: 'transplant', internalName: 'Transplant', family: 'seekers', reader: 'seeker', funnel: 'Find your people' },
  // Deliberately gender-neutral: Frequency never infers gender. Anyone who picks the activity
  // answer gets the activity-first path.
  activity_first: { id: 'activity_first', internalName: 'Activity-First', family: 'seekers', reader: 'seeker', funnel: 'Find your people' },
  evidence_first: { id: 'evidence_first', internalName: 'Evidence-First Skeptic', family: 'seekers', reader: 'seeker', funnel: 'Calm down fast' },
  host_connector: { id: 'host_connector', internalName: 'Host-Connector', family: 'latent_leaders', reader: 'leader', funnel: 'Host one Circle' },
  gathering_host: { id: 'gathering_host', internalName: 'Gathering Host', family: 'latent_leaders', reader: 'leader', funnel: 'Host one Circle, then Bring your practice' },
  mission_patron: { id: 'mission_patron', internalName: 'Mission Patron', family: 'supporter', reader: 'seeker', funnel: 'Any member funnel' },
  portfolio_teacher: { id: 'portfolio_teacher', internalName: 'Portfolio Teacher', family: 'builders', reader: 'builder', funnel: 'Bring your practice' },
  second_act: { id: 'second_act', internalName: 'Second-Act Practitioner', family: 'builders', reader: 'builder', funnel: 'Bring your practice' },
  studio_keeper: { id: 'studio_keeper', internalName: 'Studio Keeper', family: 'builders', reader: 'builder', funnel: 'Run it together' },
  network_steward: { id: 'network_steward', internalName: 'Network Steward', family: 'builders', reader: 'builder', funnel: 'Run it together' },
}

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as ArchetypeId[]

export function isArchetypeId(value: unknown): value is ArchetypeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ARCHETYPES, value)
}

/** The marketing tag stamped beside the persona tag (registered in lib/traits/registry.ts). */
export function archetypeTag(id: unknown): string | null {
  return isArchetypeId(id) ? `archetype_${id}` : null
}

/** One arrival follow-up option: the member's own words, and the archetype it stamps. */
export interface FollowUpOption {
  label: string
  archetype: ArchetypeId
}

/** The one follow-up per persona (keyed by persona id in lib/onboarding/personas.ts). A persona with
 *  no entry asks nothing. Skipping is always allowed. */
export const FOLLOW_UPS: Readonly<Record<string, readonly FollowUpOption[]>> = {
  visitor: [
    { label: 'I can’t switch off', archetype: 'wired_professional' },
    { label: 'I’m new around here', archetype: 'transplant' },
    { label: 'I want something to do, like a run or a game night', archetype: 'activity_first' },
    { label: 'Just a timer, no fluff', archetype: 'evidence_first' },
    { label: 'I want to help keep this free', archetype: 'mission_patron' },
  ],
  builder: [
    { label: 'Not yet, but I want to host', archetype: 'host_connector' },
    { label: 'I already run something and it’s growing', archetype: 'gathering_host' },
  ],
  practitioner: [
    { label: 'I teach at a few studios', archetype: 'portfolio_teacher' },
    { label: 'I run my own practice', archetype: 'second_act' },
  ],
  partner: [
    { label: 'I run a studio or space', archetype: 'studio_keeper' },
    { label: 'I run several groups or a nonprofit', archetype: 'network_steward' },
  ],
}

/** The follow-up options for a persona, or [] when it asks nothing. */
export function followUpsFor(persona: string | null | undefined): readonly FollowUpOption[] {
  return (persona && FOLLOW_UPS[persona]) || []
}

/** Resolve an archetype answer against the persona it was asked under. An answer that does not
 *  belong to that persona's follow-up is dropped (a stale cookie after the persona changed). */
export function resolveArchetype(persona: string | null | undefined, answer: unknown): ArchetypeId | null {
  if (!isArchetypeId(answer)) return null
  return followUpsFor(persona).some((o) => o.archetype === answer) ? answer : null
}

/** The fallbacks the handoff names: a member who starts Crew without an archetype is a supporter. */
export const CREW_FALLBACK_ARCHETYPE: ArchetypeId = 'mission_patron'
