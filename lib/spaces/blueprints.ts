// PER-TYPE ROLE BLUEPRINTS for entity profiles (ENTITY-SPACES-BUILD §B.3, ENTITY-SPACES-SYSTEM
// §2.2). A blueprint is DATA, not code: per `spaces.type` it declares the profile's TAB set, the
// MODULE set per tab, the hero CTA (label + which tab it points at), and which hero StatCards
// show. The route shell renders a blueprint; one unified profile, typed composition (D1).
//
// This file is pure + dependency-light (no Supabase/React), so it is trivially unit-testable and
// safe to import from the module-route resolver, the shell, the layout editor, and the seed. New
// roles (Business · Organization · Coaching · Event Space) are ADDED here as descriptors — no core
// edit (the §2.10 extensibility contract). Only Practitioner is fully wired in Phase 1; the others
// are stubbed below as the typed extension point.
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
  /** Operator-facing type label — the type badge text in the hero (§A.4). */
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

/** Every registered role blueprint, keyed by `spaces.type`. Only Practitioner is wired for
 *  Phase 1; add Business/Organization/Coaching/Event Space as descriptors here (no core edit). */
const BLUEPRINTS: Record<string, RoleBlueprint> = {
  practitioner: PRACTITIONER,
}

/** The blueprint for a `spaces.type`, or null when no blueprint is registered for that type yet
 *  (the shell fails CLOSED to an About-only profile for an unknown type — §1.3, Epic 1.3). */
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

/** Every entity module id any blueprint references (the union) — the palette the layout editor
 *  offers on /spaces/* and the registry must bind. De-duped, stable order. */
export function allEntityModuleIds(): string[] {
  const seen = new Set<string>()
  for (const bp of Object.values(BLUEPRINTS)) {
    for (const tab of bp.tabs) for (const id of tab.modules) seen.add(id)
  }
  return [...seen]
}
