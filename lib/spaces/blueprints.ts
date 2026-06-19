// PER-TYPE ROLE BLUEPRINTS for entity profiles (ENTITY-SPACES-BUILD §B.3, ENTITY-SPACES-SYSTEM
// §2.2). A blueprint is DATA, not code: per `spaces.type` it declares the profile's TAB set, the
// MODULE set per tab, the hero CTA (label + which tab it points at), and which hero StatCards
// show. The route shell renders a blueprint; one unified profile, typed composition (D1).
//
// This file is pure + dependency-light (no Supabase/React), so it is trivially unit-testable and
// safe to import from the module-route resolver, the shell, the layout editor, and the seed. New
// roles (Business, Organization, Coaching, Event Space) are ADDED here as descriptors, no core
// edit (the §2.10 extensibility contract). Practitioner is the Wave A first role; Business,
// Organization, Coaching, and Event Space are wired in Wave B below (the typed extension point).
//
// COPY NOTE (NAMING + CONTENT-VOICE §10): tab labels + StatCard labels are plain nouns; the CTA is
// a plain verb ("Book"). No "points", no em/en dashes. Stat labels per §B.3.

/** The profile tabs a blueprint can declare. Each maps to a route segment under /spaces/<slug>
 *  ('about' is the index page). Adding a tab = a segment here + a page.tsx + a module set. */
export type EntityTabId = 'about' | 'offerings' | 'practices' | 'community' | 'team' | 'book' | 'tickets' | 'donate' | 'enroll'

/** One tab in a blueprint: its id (= route segment, 'about' = index), member-facing label, and
 *  the entity module ids rendered in it (in default order). The label runs CONTENT-VOICE §10. */
export interface EntityTab {
  id: EntityTabId
  label: string
  /** The entity module ids this tab renders (registered in lib/widgets/modules.ts). */
  modules: readonly string[]
}

/** One hero StatCard slot: a plain-noun label + the live metric it reads. The shell fills the
 *  value at render from the Space's own rows; a blueprint only declares WHICH four show (§B.3). */
export interface HeroStat {
  /** A stable key the shell switches on to compute the value. */
  metric: 'clients' | 'sessions' | 'practices' | 'standing' | 'members' | 'offerings' | 'circles'
  /** The plain-noun label shown under the value (sentence case, no "points"). */
  label: string
}

/** A typed profile composition for one `spaces.type` (§B.3). */
export interface RoleBlueprint {
  type: string
  /** Operator-facing type label (the type badge text in the hero, §A.4). */
  typeLabel: string
  /** The ordered tab set (first tab is the profile index, /spaces/<slug>). */
  tabs: readonly EntityTab[]
  /** The dynamic primary CTA (§A.4): a plain verb + the tab it routes to. */
  primaryCta: { label: string; tab: EntityTabId }
  /** The hero StatCards, in order (the shell renders up to four). */
  heroStats: readonly HeroStat[]
  /** The default skin token applied when this type provisions (a curated DAWN skin). */
  defaultSkin: string
}

// ── Practitioner (the recommended first role, §B.3) ──────────────────────────────────────────
// Tabs: About · Offerings · Practices & Journeys · Community · Book.
// Hero CTA: Book. Hero stats: Clients · Sessions · Practices · Standing.
const PRACTITIONER: RoleBlueprint = {
  type: 'practitioner',
  typeLabel: 'Practitioner',
  tabs: [
    { id: 'about', label: 'About', modules: ['entity-about', 'entity-stats', 'entity-offerings'] },
    { id: 'offerings', label: 'Offerings', modules: ['entity-offerings'] },
    { id: 'practices', label: 'Practices & Journeys', modules: ['entity-practices'] },
    { id: 'community', label: 'Community', modules: ['entity-community'] },
    { id: 'book', label: 'Book', modules: ['entity-cta'] },
  ],
  primaryCta: { label: 'Book', tab: 'book' },
  heroStats: [
    { metric: 'sessions', label: 'Sessions' },
    { metric: 'offerings', label: 'Offerings' },
    { metric: 'practices', label: 'Practices' },
    { metric: 'circles', label: 'Circles' },
  ],
  defaultSkin: 'dawn',
}

// ── Business: studio / gym / brand (§2.5) ────────────────────────────────────────────────────
// JTBD: a studio runs recurring classes, memberships, staff, and a branded space. Same seven
// entity modules as Practitioner; only the tab labels, CTA, hero stats, and order differ.
// Tabs: About · Classes (entity-offerings) · Practices · Community · Team · Join (entity-cta).
// Hero CTA: "Become a member". Hero stats: members · classes (offerings) · circles.
// NOTE: the wired profile route segments today are about/offerings/practices/community/book, so
// the "Classes" tab rides the 'offerings' segment, "Team" rides 'community', and the join CTA
// rides the 'book' segment (the CTA label is read from primaryCta.label, independent of segment).
// A dedicated team/join route + role-specific deep modules (memberships) are a LATER step.
const BUSINESS: RoleBlueprint = {
  type: 'business',
  typeLabel: 'Business',
  tabs: [
    { id: 'about', label: 'About', modules: ['entity-about', 'entity-stats', 'entity-offerings', 'entity-team'] },
    { id: 'offerings', label: 'Classes', modules: ['entity-offerings'] },
    { id: 'practices', label: 'Practices', modules: ['entity-practices'] },
    { id: 'community', label: 'Community', modules: ['entity-community'] },
    { id: 'book', label: 'Join', modules: ['entity-cta'] },
  ],
  primaryCta: { label: 'Become a member', tab: 'book' },
  heroStats: [
    { metric: 'members', label: 'Members' },
    { metric: 'offerings', label: 'Classes' },
    { metric: 'circles', label: 'Circles' },
  ],
  // SAME curated DAWN skin as Practitioner for Wave B. Bespoke per-role skins are a LATER step.
  defaultSkin: 'dawn',
}

// ── Organization: non-profit (§2.6) ──────────────────────────────────────────────────────────
// JTBD: a non-profit runs programs, raises money, and manages supporters. Same seven modules.
// Tabs: About · Programs (entity-offerings) · Practices · Community · Team · Donate (entity-cta).
// Hero CTA: "Donate". Hero stats: members (supporters) · programs (offerings) · circles.
// Same wired-segment mapping as Business (Programs → 'offerings', Team → 'community', Donate →
// 'book'). Hosted donation forms + tax-receipt deep modules are a LATER step.
const ORGANIZATION: RoleBlueprint = {
  type: 'organization',
  typeLabel: 'Organization',
  tabs: [
    { id: 'about', label: 'About', modules: ['entity-about', 'entity-stats', 'entity-offerings', 'entity-team'] },
    { id: 'offerings', label: 'Programs', modules: ['entity-offerings'] },
    { id: 'practices', label: 'Practices', modules: ['entity-practices'] },
    { id: 'community', label: 'Community', modules: ['entity-community'] },
    { id: 'book', label: 'Donate', modules: ['entity-cta'] },
  ],
  primaryCta: { label: 'Donate', tab: 'book' },
  heroStats: [
    { metric: 'members', label: 'Supporters' },
    { metric: 'offerings', label: 'Programs' },
    { metric: 'circles', label: 'Circles' },
  ],
  // SAME curated DAWN skin as Practitioner for Wave B. Bespoke per-role skins are a LATER step.
  defaultSkin: 'dawn',
}

// ── Coaching: academy (§2.7) ─────────────────────────────────────────────────────────────────
// JTBD: a coaching brand runs cohort + 1:1 programs with a curriculum. Same seven modules.
// Tabs: About · Programs (entity-offerings) · Curriculum (entity-practices) · Community · Team ·
// Enroll (entity-cta). Hero CTA: "Enroll". Hero stats: members (cohort) · practices (curriculum)
// · circles (cohorts). Same wired-segment mapping (Curriculum → 'practices'). Cohort/curriculum
// deep modules are a LATER step.
const COACHING: RoleBlueprint = {
  type: 'coaching',
  typeLabel: 'Coaching',
  tabs: [
    { id: 'about', label: 'About', modules: ['entity-about', 'entity-stats', 'entity-offerings', 'entity-team'] },
    { id: 'offerings', label: 'Programs', modules: ['entity-offerings'] },
    { id: 'practices', label: 'Curriculum', modules: ['entity-practices'] },
    { id: 'community', label: 'Community', modules: ['entity-community'] },
    { id: 'book', label: 'Enroll', modules: ['entity-cta'] },
  ],
  primaryCta: { label: 'Enroll', tab: 'book' },
  heroStats: [
    { metric: 'members', label: 'Cohort' },
    { metric: 'practices', label: 'Curriculum' },
    { metric: 'circles', label: 'Cohorts' },
  ],
  // SAME curated DAWN skin as Practitioner for Wave B. Bespoke per-role skins are a LATER step.
  defaultSkin: 'dawn',
}

// ── Event Space: venue / retreat (§2.8) ──────────────────────────────────────────────────────
// JTBD: a venue or retreat sells tickets, manages capacity, and checks attendees in. Same seven
// entity modules. Tabs: About · Events (entity-offerings) · Practices · Community · Tickets
// (entity-cta). Hero CTA: "Get tickets". Hero stats: members (attendees) · offerings (events) ·
// circles. Same wired-segment mapping as the other Wave B roles (Events rides 'offerings',
// Tickets rides 'book'); the CTA label is read from primaryCta.label, independent of segment.
// Deep ticketing, capacity, lodging, and waiver modules are a LATER step.
const EVENT_SPACE: RoleBlueprint = {
  type: 'event_space',
  typeLabel: 'Event Space',
  tabs: [
    { id: 'about', label: 'About', modules: ['entity-about', 'entity-stats', 'entity-offerings'] },
    { id: 'offerings', label: 'Events', modules: ['entity-offerings'] },
    { id: 'practices', label: 'Practices', modules: ['entity-practices'] },
    { id: 'community', label: 'Community', modules: ['entity-community'] },
    { id: 'book', label: 'Tickets', modules: ['entity-cta'] },
  ],
  primaryCta: { label: 'Get tickets', tab: 'book' },
  heroStats: [
    { metric: 'members', label: 'Attendees' },
    { metric: 'offerings', label: 'Events' },
    { metric: 'circles', label: 'Circles' },
  ],
  // SAME curated DAWN skin as Practitioner for Wave B. Bespoke per-role skins are a LATER step.
  defaultSkin: 'dawn',
}

/** Every registered role blueprint, keyed by `spaces.type`. Practitioner is the Wave A first
 *  role; Business/Organization/Coaching/Event Space ship in Wave B (this is the §2.10 extension
 *  point: a descriptor, no core edit). */
const BLUEPRINTS: Record<string, RoleBlueprint> = {
  practitioner: PRACTITIONER,
  business: BUSINESS,
  organization: ORGANIZATION,
  coaching: COACHING,
  event_space: EVENT_SPACE,
}

/** The blueprint for a `spaces.type`, or null when no blueprint is registered for that type yet
 *  (the shell fails CLOSED to an About-only profile for an unknown type, §1.3, Epic 1.3). */
export function blueprintForType(type: string | null | undefined): RoleBlueprint | null {
  if (!type) return null
  return BLUEPRINTS[type] ?? null
}

/** The blueprint's tab whose id matches `tabId`, or the first (index) tab when the id is unknown
 *  or absent. Used by the shell to resolve the active tab from the route segment. */
export function tabForSegment(blueprint: RoleBlueprint, tabId: string | undefined): EntityTab {
  if (!tabId) return blueprint.tabs[0]!
  return blueprint.tabs.find((t) => t.id === tabId) ?? blueprint.tabs[0]!
}

/** Every entity module id any blueprint references (the union): the palette the layout editor
 *  offers on /spaces/* and the registry must bind. De-duped, stable order. */
export function allEntityModuleIds(): string[] {
  const seen = new Set<string>()
  for (const bp of Object.values(BLUEPRINTS)) {
    for (const tab of bp.tabs) for (const id of tab.modules) seen.add(id)
  }
  return [...seen]
}
