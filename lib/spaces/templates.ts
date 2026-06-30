// SPACE PUBLIC-PAGE LAYOUT TEMPLATES (ADR-472, the Tier x Mode public-page layer). A Space's PUBLIC
// page (/spaces/<slug> + its tabs) renders through ONE OF FOUR layout templates, each with a DISTINCT
// hero / body / function arrangement: Book · Schedule · Storefront · Hub. The template is a START POINT
// and a PRESET, never a lock: an operator can switch template, reorder, and turn any tab/function on
// regardless (the resolver honors a `preferences.template` override; nothing here gates anything).
//
// This is the PUBLIC twin of the operator-side Mode registry (lib/spaces/modes.ts) and reuses the
// per-type RoleBlueprint (lib/spaces/blueprints.ts) for its tab + module + stat vocabulary. A blueprint
// stays keyed by `spaces.type` (one composition per type); a TEMPLATE re-frames that composition by what
// the Space's Mode FORWARDS (booking time, a recurring schedule, a catalog, a mission), so two Spaces of
// the same type but different Mode read as visibly different sites.
//
// SHAPE: PURE + dependency-light. It imports ONLY the pure types from blueprints/modes/plans (no React /
// Supabase / Next / server-only), so it is trivially unit-testable AND safe to import from a client
// component, the shell, the layout editor, and the resolver alike. The classic build-only failure is a
// client component pulling in a `server-only` module through a transitive import; keeping this registry
// pure avoids it. Any DB / cookie read that feeds `templateForSpace` stays in the (server) caller; this
// file only maps plain data in to plain data out.
//
// WHITE-LABEL (AGENTS.md, D4/D6): a descriptor names ordered MODULE IDS + STAT METRICS + a CTA, never any
// chrome. The page body paints from the Space's own brand tokens; nothing here hardcodes a hex or a
// Frequency-specific surface. Semantic DAWN tokens only, decided at the render layer, never here.
//
// COPY NOTE (NAMING + CONTENT-VOICE §10): every label is a plain noun and every CTA a plain verb, sourced
// from the established blueprint vocabulary ("Book", "Get tickets", "Donate"). No "points". No em/en dashes.

import type { EntityTab, EntityTabId, HeroStat, RoleBlueprint } from './blueprints'
import type { SpaceType } from './types'
import { asSpacePlan, type SpacePlan } from '../pricing/plans'

/** The four public-page layout templates (ADR-472). Each forwards a different primary function, so each
 *  resolves to a DISTINCT hero / lead body / stat set / CTA:
 *   - `book`       — a booking calendar; time is the product (practitioner / service / 1:1 coaching).
 *   - `schedule`   — a recurring timetable of classes/events + tickets/memberships (studio / venue).
 *   - `storefront` — a catalog grid of products / digital goods / programs (product / cohort / creator).
 *   - `hub`        — mission + a primary ask + community, all functions on (nonprofit / organization). */
export type SpaceTemplate = 'book' | 'schedule' | 'storefront' | 'hub'

/** The four template ids, for iteration / validation. */
export const SPACE_TEMPLATES = ['book', 'schedule', 'storefront', 'hub'] as const

/** A plain operator-facing label per template (sentence case, plain noun, no em dashes). */
export const SPACE_TEMPLATE_LABEL: Record<SpaceTemplate, string> = {
  book: 'Book',
  schedule: 'Schedule',
  storefront: 'Storefront',
  hub: 'Hub',
}

/** Is `value` one of the four template ids? (Closed set; used to validate a `preferences.template`
 *  override before it is trusted.) PURE. */
export function isSpaceTemplate(value: unknown): value is SpaceTemplate {
  return typeof value === 'string' && (SPACE_TEMPLATES as readonly string[]).includes(value)
}

/** A hero headline EMPHASIS hint: which promise the hero leads with, so the four heroes read distinct
 *  even before brand tokens land. The render layer maps this to copy/structure; it is a hint, not chrome.
 *   - `who-you-help` — a who-you-help headline + face + ONE booking CTA (Book).
 *   - `identity`     — identity + the schedule front-and-center (Schedule).
 *   - `brand`        — a brand line + a single static catalog frame (Storefront).
 *   - `mission`      — a mission line + an impact-first ask (Hub). */
export type HeroEmphasis = 'who-you-help' | 'identity' | 'brand' | 'mission'

/** The hero configuration a template paints: the single primary CTA (a plain verb + the tab it routes to,
 *  reusing the blueprint's EntityTabId vocabulary), the ordered hero stat metrics, and the headline
 *  emphasis hint. The CTA tab is always one of the five wired profile segments, so it never 404s. */
export interface TemplateHero {
  /** The single primary CTA: a plain verb + the wired tab it routes to. */
  primaryCta: { label: string; tab: EntityTabId }
  /** The ordered hero stat slots (the shell renders up to four, dropping any that resolve to zero). */
  heroStats: readonly HeroStat[]
  /** The headline emphasis hint (which promise leads the hero). */
  emphasis: HeroEmphasis
}

/** A full layout descriptor for one template: the hero config, the ordered tabs (by their wired
 *  EntityTabId, re-labelled per template), and the LANDING (About) body section order — the ordered
 *  `entity-*` module ids the About tab leads with, `aboutLead` being the headline section. Everything is
 *  a START POINT: the operator Layout editor can reorder/hide any of it; the template only seeds it. */
export interface SpaceTemplateDescriptor {
  /** The template id this descriptor is for. */
  template: SpaceTemplate
  /** The hero config (CTA + ordered stats + emphasis). */
  hero: TemplateHero
  /** The ordered tab ids (always the five wired segments; order + emphasis differ per template). */
  tabOrder: readonly EntityTabId[]
  /** The LANDING (About) body section order: the ordered entity module ids the About tab renders. The
   *  composite empty (`entity-getting-started`) always leads (it renders only for a brand-new Space),
   *  then `aboutLead`, then the rest, so each template's body leads with a DISTINCT block. */
  aboutModules: readonly string[]
  /** The headline lead block of the About body (= `aboutModules[1]`, after the getting-started empty),
   *  hoisted for the render layer + the tests. The four templates lead with four different blocks. */
  aboutLead: string
}

// The five wired profile route segments (a page.tsx exists for each), shared by every template so a tab
// link never 404s. The order below is the template's DEFAULT tab order; the operator can re-sort.
const WIRED_TABS: readonly EntityTabId[] = ['about', 'offerings', 'practices', 'community', 'book']

// ── BOOK — a booking calendar; time is the product (ADR-472) ───────────────────────────────────────
// Hero: a who-you-help headline + face + ONE "Book a session" CTA. Body leads with bookable offerings +
// the booking block (entity-offerings then entity-cta), then proof (about / community). Stat cards:
// Clients · Standing · Offerings · Sessions.
const BOOK: SpaceTemplateDescriptor = {
  template: 'book',
  hero: {
    primaryCta: { label: 'Book a session', tab: 'book' },
    heroStats: [
      { metric: 'clients', label: 'Clients' },
      { metric: 'standing', label: 'Standing' },
      { metric: 'offerings', label: 'Offerings' },
      { metric: 'sessions', label: 'Sessions' },
    ],
    emphasis: 'who-you-help',
  },
  tabOrder: WIRED_TABS,
  // Lead with what is bookable (offerings) then the booking block (entity-cta), so the page opens on the
  // product (time) before the story.
  aboutModules: ['entity-getting-started', 'entity-offerings', 'entity-cta', 'entity-about', 'entity-community'],
  aboutLead: 'entity-offerings',
}

// ── SCHEDULE — a recurring timetable + tickets/memberships (ADR-472) ───────────────────────────────
// Hero: identity + the schedule front-and-center + "See the schedule". Body leads with the timetable
// (entity-offerings), then the proof (about / community). Stat cards: Classes/Events · Members ·
// Sessions · Circles (the "next date" slot has no live metric yet, so circles rides last).
const SCHEDULE: SpaceTemplateDescriptor = {
  template: 'schedule',
  hero: {
    primaryCta: { label: 'See the schedule', tab: 'offerings' },
    heroStats: [
      { metric: 'offerings', label: 'Classes' },
      { metric: 'members', label: 'Members' },
      { metric: 'sessions', label: 'Sessions' },
      { metric: 'circles', label: 'Circles' },
    ],
    emphasis: 'identity',
  },
  tabOrder: WIRED_TABS,
  // Lead with the timetable (entity-offerings) front-and-center, then identity, then community proof.
  aboutModules: ['entity-getting-started', 'entity-offerings', 'entity-about', 'entity-community'],
  aboutLead: 'entity-offerings',
}

// ── STOREFRONT — a catalog grid of products / digital goods / programs (ADR-472) ───────────────────
// Hero: a brand line + "Browse the catalog" (a single static frame, no carousel). Body leads with the
// catalog (entity-offerings = the curated grid), then reviews/proof (about), then community/newsletter
// join (entity-community). Stat cards: Offerings · Clients · Members · Standing.
const STOREFRONT: SpaceTemplateDescriptor = {
  template: 'storefront',
  hero: {
    primaryCta: { label: 'Browse the catalog', tab: 'offerings' },
    heroStats: [
      { metric: 'offerings', label: 'Offerings' },
      { metric: 'clients', label: 'Clients' },
      { metric: 'members', label: 'Members' },
      { metric: 'standing', label: 'Standing' },
    ],
    emphasis: 'brand',
  },
  tabOrder: WIRED_TABS,
  // Lead with the catalog grid (entity-offerings), then the brand story (about), then the community join.
  aboutModules: ['entity-getting-started', 'entity-offerings', 'entity-about', 'entity-community'],
  aboutLead: 'entity-offerings',
}

// ── HUB — mission + a primary ask + community, all functions on (ADR-472) ──────────────────────────
// Hero: a mission line + "Get involved". Body: mission + proof (about) -> the ask (entity-cta,
// impact-first) -> programs (entity-offerings) -> community/stories (entity-community) -> team
// (entity-team). Stat cards: People supported (members) · Programs (offerings) · Circles · Standing.
const HUB: SpaceTemplateDescriptor = {
  template: 'hub',
  hero: {
    primaryCta: { label: 'Get involved', tab: 'book' },
    heroStats: [
      { metric: 'members', label: 'People supported' },
      { metric: 'offerings', label: 'Programs' },
      { metric: 'circles', label: 'Circles' },
      { metric: 'standing', label: 'Standing' },
    ],
    emphasis: 'mission',
  },
  tabOrder: WIRED_TABS,
  // Lead with the mission (about), then the impact-first ask (entity-cta), then programs, community, team
  // — all functions on, the fullest body of the four templates.
  aboutModules: [
    'entity-getting-started',
    'entity-about',
    'entity-cta',
    'entity-offerings',
    'entity-community',
    'entity-team',
  ],
  aboutLead: 'entity-about',
}

/** Every registered template descriptor, keyed by template id. */
const TEMPLATES: Record<SpaceTemplate, SpaceTemplateDescriptor> = {
  book: BOOK,
  schedule: SCHEDULE,
  storefront: STOREFRONT,
  hub: HUB,
}

/** The layout descriptor for a template id. PURE + total (the id is a closed union, so this never
 *  returns null). */
export function templateDescriptor(template: SpaceTemplate): SpaceTemplateDescriptor {
  return TEMPLATES[template]
}

// ── The (type, variant) -> template MAP (ADR-472) ──────────────────────────────────────────────────
// One row per registered Mode (type, variant). The forward FUNCTION decides the template:
//   practitioner/* + business/service + coaching/packages  -> BOOK       (time is the product)
//   studio (business/service studio framing) + event_space/* -> SCHEDULE  (a recurring timetable)
//   business/product + coaching/cohort + creator            -> STOREFRONT (a catalog)
//   organization/* + lab/cohort + community                 -> HUB        (mission + ask + community)
// NOTE on studio: the wizard offers "Studio or gym" as (business, service) (lib/spaces/modes.ts
// WIZARD_CHOICES), the SAME (type, variant) as a plain service business. The two share a Mode, so we
// cannot split them on (type, variant) alone; the plain service business is the more common reading, so
// (business, service) maps to BOOK by default and a studio operator switches to SCHEDULE via the template
// override (preferences.template). This is the documented limitation of mapping on (type, variant) only.
const VARIANT_TEMPLATE: Record<string, SpaceTemplate> = {
  // BOOK — time is the product.
  'practitioner:appointments': 'book',
  'practitioner:programs': 'book',
  'business:service': 'book',
  'coaching:packages': 'book',
  // SCHEDULE — a recurring timetable + tickets/memberships.
  'event_space:ticketed': 'schedule',
  'event_space:membership': 'schedule',
  // STOREFRONT — a catalog.
  'business:product': 'storefront',
  'coaching:cohort': 'storefront',
  // HUB — mission + ask + community.
  'organization:donations': 'hub',
  'organization:programs': 'hub',
  'lab:cohort': 'hub',
}

// The per-TYPE fallback template, for a type whose exact (type, variant) is not in VARIANT_TEMPLATE
// (e.g. an unknown / null variant, or a type with no Mode rows like `partner`). Keeps the resolver total
// and on-brand: a practitioner with a null variant still lands on BOOK, a partner on STOREFRONT (a brand
// running a program), etc. NP/Org are handled by the plan gate before this map is consulted.
const TYPE_FALLBACK_TEMPLATE: Partial<Record<SpaceType, SpaceTemplate>> = {
  practitioner: 'book',
  business: 'book',
  coaching: 'book',
  event_space: 'schedule',
  organization: 'hub',
  lab: 'hub',
  partner: 'storefront',
}

/** Read a validated `template` override off the raw `spaces.preferences` blob, or null. The override lives
 *  at `preferences.template` (a sibling of the Mode overrides under `preferences.mode`). Tolerant of any
 *  shape (a malformed blob yields null); a value that is not one of the four template ids is dropped, so a
 *  stale / hand-edited override never reaches the resolver. PURE. */
export function readTemplateOverride(raw: unknown): SpaceTemplate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = (raw as Record<string, unknown>).template
  return isSpaceTemplate(value) ? value : null
}

/** The inputs the template resolver reads off a Space. All optional + tolerant: a missing field falls to
 *  the default-safe path, so the resolver is TOTAL (it always returns one of the four templates). */
export interface TemplateResolverInput {
  /** The Space type (spaces.type). */
  type: SpaceType | null | undefined
  /** The Focus sub-mode (spaces.mode_variant). Null / unknown falls to the type fallback. */
  variant?: string | null
  /** The billing tier label (spaces.plan). Nonprofit / Organization tiers force HUB. */
  plan?: string | null
  /** The raw `spaces.preferences` blob (an optional `template` override is read off it). */
  preferences?: unknown
}

/**
 * Resolve the public-page layout template for a Space. PURE + TOTAL (always returns one of the four).
 * Resolution order (most specific wins):
 *   1. A valid `preferences.template` override (the operator switched template) ALWAYS wins.
 *   2. A Nonprofit or Organization TIER -> `hub` (NP/Org default to the Hub with all functions visible,
 *      same layout for both, per ADR-472 tier assignment). The `business` tier is Pro-depth, NOT a Hub.
 *   3. The exact (type, variant) -> template map (the Mode forwards the template).
 *   4. The per-type fallback template (a null / unknown variant still lands on-brand).
 *   5. A final default of `book` (default-safe for an unknown type, so the page always renders).
 * Mode never gates: this is FREE framing, exactly like the Mode registry.
 */
export function templateForSpace(input: TemplateResolverInput): SpaceTemplate {
  // 1. An explicit, valid operator override always wins (the template is a preset, never a lock).
  const override = readTemplateOverride(input.preferences)
  if (override) return override

  // 2. NP / Org tier -> Hub (the tier assignment: both default to the Hub, all functions visible). The
  //    first-class `business` tier is Pro-depth commerce, not a Hub, so it is deliberately NOT gated here.
  const plan: SpacePlan = asSpacePlan(input.plan)
  if (plan === 'nonprofit' || plan === 'organization') return 'hub'

  // 3. The exact (type, variant) Mode -> template map.
  if (input.type && typeof input.variant === 'string') {
    const exact = VARIANT_TEMPLATE[`${input.type}:${input.variant}`]
    if (exact) return exact
  }

  // 4. The per-type fallback (a null / unknown variant still resolves on-brand).
  if (input.type) {
    const byType = TYPE_FALLBACK_TEMPLATE[input.type]
    if (byType) return byType
  }

  // 5. Default-safe: an unknown type still gets a real template so the page renders.
  return 'book'
}

/** Resolve the full layout descriptor for a Space in one call (the resolver + the descriptor lookup).
 *  PURE + total. The render layer reads this to paint the hero CTA, the ordered stats, the tab order, and
 *  the About body lead block, instead of the hardcoded per-type blueprint values. */
export function templateDescriptorForSpace(input: TemplateResolverInput): SpaceTemplateDescriptor {
  return templateDescriptor(templateForSpace(input))
}

// ── The blueprint -> template BRIDGE (ADR-472 deliverable 2) ───────────────────────────────────────
// The per-type RoleBlueprint (lib/spaces/blueprints.ts) still carries the tab LABELS + the per-tab MODULE
// sets (the vocabulary other code already depends on). A TEMPLATE re-frames that blueprint: it swaps in
// the template's primary CTA + hero stats, re-orders the tabs to the template's order, and replaces the
// About (index) tab's module order with the template's `aboutModules`. We DERIVE a new RoleBlueprint
// (never mutate the source), so the layout/hero/landing resolve through the template while every existing
// tab route + module is preserved (nothing removed or locked; the operator Layout editor still wins on
// top). PURE.

/** The About module order for a template, RESTRICTED to the modules the blueprint's own About tab carries
 *  (so we never reference a module a blueprint does not declare), with any blueprint module the template
 *  did not name appended at the end (never silently dropped). `entity-getting-started` always leads when
 *  the blueprint has it (the composite empty for a brand-new Space, §3). */
function bridgeAboutModules(blueprint: RoleBlueprint, descriptor: SpaceTemplateDescriptor): readonly string[] {
  const aboutTab = blueprint.tabs.find((t) => t.id === 'about')
  const available = new Set(aboutTab?.modules ?? [])
  // The template's order, keeping only modules this blueprint actually has on its About tab.
  const ordered = descriptor.aboutModules.filter((m) => available.has(m))
  // Any blueprint About module the template did not name rides at the end (preserve, never drop).
  const rest = (aboutTab?.modules ?? []).filter((m) => !ordered.includes(m))
  const merged = [...ordered, ...rest]
  return merged.length > 0 ? merged : (aboutTab?.modules ?? [])
}

/** Derive the EFFECTIVE profile blueprint for a Space: the per-type blueprint re-framed by its resolved
 *  template. The result keeps the blueprint's tab labels + module sets but takes the template's primary
 *  CTA, hero stats, tab ORDER, and About body module order. PURE + total. The layout + tab body read this
 *  instead of the raw blueprint, so the four templates render distinct hero CTA + stat set + tab order +
 *  lead body. When the blueprint is null (an unknown type), returns null and the caller fails closed as
 *  before. */
export function blueprintForSpace(
  blueprint: RoleBlueprint | null,
  input: TemplateResolverInput,
): RoleBlueprint | null {
  if (!blueprint) return null
  const descriptor = templateDescriptorForSpace(input)

  // Re-order the blueprint's tabs to the template's tab order, keeping each tab's blueprint label + module
  // set. A tab the blueprint does not have is skipped; a blueprint tab the template did not order rides at
  // the end (never dropped). The About tab's module order is swapped to the template's lead-first order.
  const byId = new Map<EntityTabId, EntityTab>(blueprint.tabs.map((t) => [t.id, t]))
  const orderedIds = descriptor.tabOrder.filter((id) => byId.has(id))
  const extraIds = blueprint.tabs.map((t) => t.id).filter((id) => !orderedIds.includes(id))
  const aboutModules = bridgeAboutModules(blueprint, descriptor)
  const tabs: EntityTab[] = [...orderedIds, ...extraIds].map((id) => {
    const tab = byId.get(id)!
    return id === 'about' ? { ...tab, modules: aboutModules } : tab
  })

  return {
    ...blueprint,
    tabs,
    primaryCta: descriptor.hero.primaryCta,
    heroStats: descriptor.hero.heroStats,
  }
}
