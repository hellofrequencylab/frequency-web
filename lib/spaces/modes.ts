// SPACE MODES - the operator-side registry for a Space's operating model (ADR-461/464, the Space Modes
// plan §2b). A Space's `type` is its operating MODE; a finer `mode_variant` is its FOCUS sub-mode. This
// file is a PURE, data-only registry of one `ModeProfile` per `(type, variant)`: it decides which Pro
// modules LEAD on the console, the default settings toggles, the default CRM pipeline, the lexicon, the
// recommended add-ons, and the dashboard next-best-actions. Everything here is a DEFAULT or an EMPHASIS,
// NEVER a gate: a capability is gated only by the entitlement engine (plan + add-ons) and the space-role
// ladder (lib/spaces/functions.ts). Mode is FREE (framing, not entitlement), so nothing here touches
// billing. The PUBLIC profile is operator-composed (feature-block pages); this file carries only the
// OPERATOR-side facets.
//
// SHAPE: pure (no React / Supabase / Next imports) so the resolver + the defaults are trivially
// unit-testable (lib/spaces/modes.test.ts) and the descriptor can be imported by the create wizard, the
// console nav/dashboard, the CRM pipeline seed, and the onboarding seeder alike. A new Mode or Focus is
// ONE descriptor here, never a core edit.
//
// COPY NOTE (NAMING + CONTENT-VOICE §10): every operator-facing string is a plain noun or a plain verb.
// No em or en dashes. Lexicon nouns (clients / customers / members / supporters; offerings / classes /
// programs / products / events) come straight from the lexicon facet, the one place a Mode renames a
// thing.

import type { SpaceType } from './types'
import type { SpaceFunctionKey } from './functions'

/** A Focus (sub-mode) id. Kept SMALL and meaningful per the plan §2a. The set is closed by the
 *  registry below; an unknown variant resolves to the type's default variant. */
export type ModeVariant =
  | 'service'
  | 'product'
  | 'packages'
  | 'cohort'
  | 'appointments'
  | 'programs'
  | 'ticketed'
  | 'membership'
  | 'donations'

/** The lexicon a Mode paints over the generic nouns. Each is the plain plural the operator surfaces use
 *  for that concept; the resolver always returns a complete set (no partial lexicon). */
export interface ModeLexicon {
  /** The people this operator works with: clients / customers / members / supporters / attendees. */
  people: string
  /** A single such person (the singular of `people`), for inline copy. */
  person: string
  /** What this operator sells / runs: offerings / classes / programs / products / events. */
  offerings: string
  /** A single offering (the singular of `offerings`). */
  offering: string
}

/** One default CRM pipeline stage in a Mode preset: a plain operator-facing column label + its kind
 *  (open / won / lost), matching the crm_stages primitive (lib/crm/stage-templates.ts). The Mode's
 *  pipeline is a SUGGESTION seeded on provision; an operator who edits it is never re-clobbered. */
export interface ModeStage {
  name: string
  kind: 'open' | 'won' | 'lost'
}

/** One dashboard next-best-action a Mode surfaces: a plain-verb label + the console surface it points
 *  at (a space menu id, e.g. 'space.offerings'). UX only, never a gate. The Mode settings view renders the
 *  label only (app/(main)/spaces/[slug]/manage/mode/page.tsx drops `surface`), so the id is a stable hint,
 *  not a live route. */
export interface ModeAction {
  /** A plain, skeptic-proof call to action (CONTENT-VOICE: a verb, no hype). */
  label: string
  /** The console surface id this action routes to (binds in the dashboard render layer). */
  surface: string
}

/** The OPERATOR preset for one `(type, variant)`: the operator-side facets of a Space's operating
 *  model. EVERYTHING here is a default or an emphasis, never a lock. */
export interface ModeProfile {
  /** The Space type (the Mode). */
  type: SpaceType
  /** The Focus sub-mode id. */
  variant: ModeVariant
  /** Operator-facing Mode label, e.g. "Coach". */
  modeLabel: string
  /** Operator-facing Focus label, e.g. "Packages and scheduling". */
  focusLabel: string
  /** One plain line describing what this Mode/Focus is for (the picker + the preview). */
  tagline: string
  /** The console nav order / MODULE EMPHASIS: the SpaceFunctionKeys this Mode leads with, most
   *  prominent first. A function not listed still renders (Mode never hides a capability) but after the
   *  emphasized set, so an operator opens to the 20% they live in. */
  navEmphasis: readonly SpaceFunctionKey[]
  /** The DEFAULT settings toggles this Mode suggests ON at provision (a subset of the type's universal
   *  functions). Suggested, never forced: an operator override always wins. */
  defaultToggles: readonly SpaceFunctionKey[]
  /** The DEFAULT CRM pipeline + stages this Mode seeds (a suggestion; additive on a later re-preset). */
  pipeline: readonly ModeStage[]
  /** The lexicon this Mode paints over the generic nouns. */
  lexicon: ModeLexicon
  /** The RECOMMENDED add-ons (suggested, never auto-on; entitlement stays the billing lane's job). The
   *  values are catalog add-on keys (marketing / ai / team / branding), surfaced as a nudge. */
  recommendedAddons: readonly string[]
  /** The dashboard next-best-actions this Mode surfaces, in order. */
  nextBestActions: readonly ModeAction[]
}

// ── Default Focus per Mode (the variant a null `mode_variant` resolves to) ────────────────────────
// Per the plan §2a. A type absent here (root) has no Focus; resolveMode falls to null (generic console).
const DEFAULT_VARIANT: Partial<Record<SpaceType, ModeVariant>> = {
  business: 'service',
  coaching: 'packages',
  practitioner: 'appointments',
  event_space: 'ticketed',
  organization: 'donations',
  lab: 'cohort',
}

// ── The registered ModeProfiles, keyed `${type}:${variant}` ───────────────────────────────────────
// Each declares the operator facets here. The pipelines mirror the per-segment stage templates
// (lib/crm/stage-templates.ts) so the Mode preview and the actual seed read the same shape; the Focus
// refines the labels per §2a.

// Business · service (default): bookings / quotes / retainers.
const BUSINESS_SERVICE: ModeProfile = {
  type: 'business',
  variant: 'service',
  modeLabel: 'Service business',
  focusLabel: 'Bookings and quotes',
  tagline: 'Take bookings, send quotes, and keep repeat clients coming back.',
  navEmphasis: ['availability', 'crm', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr', 'availability'],
  pipeline: [
    { name: 'Lead', kind: 'open' },
    { name: 'Quoted', kind: 'open' },
    { name: 'Booked', kind: 'open' },
    { name: 'Repeat', kind: 'won' },
    { name: 'Lost', kind: 'lost' },
  ],
  lexicon: { people: 'Clients', person: 'Client', offerings: 'Services', offering: 'Service' },
  recommendedAddons: ['marketing'],
  nextBestActions: [
    { label: 'Set your booking times', surface: 'space.offerings' },
    { label: 'Add a service to quote', surface: 'space.engage.crm' },
  ],
}

// Business · product: catalog / storefront / orders / inventory.
const BUSINESS_PRODUCT: ModeProfile = {
  type: 'business',
  variant: 'product',
  modeLabel: 'Product business',
  focusLabel: 'Catalog and storefront',
  tagline: 'List your catalog, run a storefront, and turn buyers into repeat customers.',
  navEmphasis: ['memberships', 'crm', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr'],
  pipeline: [
    { name: 'Lead', kind: 'open' },
    { name: 'Cart', kind: 'open' },
    { name: 'Purchased', kind: 'won' },
    { name: 'Repeat', kind: 'won' },
    { name: 'Lapsed', kind: 'lost' },
  ],
  lexicon: { people: 'Customers', person: 'Customer', offerings: 'Products', offering: 'Product' },
  recommendedAddons: ['marketing', 'branding'],
  nextBestActions: [
    { label: 'List a product', surface: 'space.offerings' },
    { label: 'Recover a cart', surface: 'space.engage.crm' },
  ],
}

// Coaching · packages (default): multi-session packages + 1:1 scheduling.
const COACHING_PACKAGES: ModeProfile = {
  type: 'coaching',
  variant: 'packages',
  modeLabel: 'Coach',
  focusLabel: 'Packages and scheduling',
  tagline: 'Sell multi-session packages and fill your calendar with the right clients.',
  navEmphasis: ['availability', 'crm', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr'],
  pipeline: [
    { name: 'Lead', kind: 'open' },
    { name: 'Discovery call', kind: 'open' },
    { name: 'Package sold', kind: 'open' },
    { name: 'Active', kind: 'open' },
    { name: 'Renewal', kind: 'won' },
    { name: 'Lapsed', kind: 'lost' },
  ],
  lexicon: { people: 'Clients', person: 'Client', offerings: 'Packages', offering: 'Package' },
  recommendedAddons: ['ai', 'marketing'],
  nextBestActions: [
    { label: 'Fill your calendar', surface: 'space.offerings' },
    { label: 'Renew a client', surface: 'space.engage.crm' },
  ],
}

// Coaching · cohort: programs / curriculum / enrollment.
const COACHING_COHORT: ModeProfile = {
  type: 'coaching',
  variant: 'cohort',
  modeLabel: 'Coach',
  focusLabel: 'Programs and cohorts',
  tagline: 'Run a curriculum and enroll cohorts into your programs.',
  navEmphasis: ['crm', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr'],
  pipeline: [
    { name: 'Lead', kind: 'open' },
    { name: 'Applied', kind: 'open' },
    { name: 'Enrolled', kind: 'open' },
    { name: 'Active', kind: 'open' },
    { name: 'Graduated', kind: 'won' },
    { name: 'Withdrew', kind: 'lost' },
  ],
  lexicon: { people: 'Students', person: 'Student', offerings: 'Programs', offering: 'Program' },
  recommendedAddons: ['ai', 'marketing'],
  nextBestActions: [
    { label: 'Open enrollment', surface: 'space.engage.crm' },
    { label: 'Welcome your cohort', surface: 'space.comms' },
  ],
}

// Practitioner · appointments (default): 1:1 booking.
const PRACTITIONER_APPOINTMENTS: ModeProfile = {
  type: 'practitioner',
  variant: 'appointments',
  modeLabel: 'Practitioner',
  focusLabel: '1:1 sessions',
  tagline: 'Open your calendar for 1:1 sessions and keep a private client journey.',
  navEmphasis: ['availability', 'crm', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr', 'availability'],
  pipeline: [
    { name: 'Inquiry', kind: 'open' },
    { name: 'Intake', kind: 'open' },
    { name: 'Active', kind: 'open' },
    { name: 'Lapsed', kind: 'lost' },
    { name: 'Rebook', kind: 'won' },
  ],
  lexicon: { people: 'Clients', person: 'Client', offerings: 'Offerings', offering: 'Offering' },
  recommendedAddons: ['ai'],
  nextBestActions: [
    { label: 'Set your availability', surface: 'space.offerings' },
    { label: 'Follow up on an inquiry', surface: 'space.engage.crm' },
  ],
}

// Practitioner · programs: paid program enrollment.
const PRACTITIONER_PROGRAMS: ModeProfile = {
  type: 'practitioner',
  variant: 'programs',
  modeLabel: 'Practitioner',
  focusLabel: 'Paid programs',
  tagline: 'Enroll clients into paid programs and guide them through a journey.',
  navEmphasis: ['crm', 'availability', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr', 'availability'],
  pipeline: [
    { name: 'Inquiry', kind: 'open' },
    { name: 'Enrolled', kind: 'open' },
    { name: 'Active', kind: 'open' },
    { name: 'Completed', kind: 'won' },
    { name: 'Lapsed', kind: 'lost' },
  ],
  lexicon: { people: 'Clients', person: 'Client', offerings: 'Programs', offering: 'Program' },
  recommendedAddons: ['ai'],
  nextBestActions: [
    { label: 'Open a program', surface: 'space.engage.crm' },
    { label: 'Set your availability', surface: 'space.offerings' },
  ],
}

// Event Space · ticketed (default): tickets / passes.
const EVENT_TICKETED: ModeProfile = {
  type: 'event_space',
  variant: 'ticketed',
  modeLabel: 'Event space',
  focusLabel: 'Tickets and passes',
  tagline: 'Sell tickets, check attendees in, and fill the room.',
  navEmphasis: ['tickets', 'checkin', 'members', 'qr'],
  defaultToggles: ['members', 'qr', 'tickets', 'checkin'],
  pipeline: [
    { name: 'Interested', kind: 'open' },
    { name: 'Reserved', kind: 'open' },
    { name: 'Attended', kind: 'won' },
    { name: 'No show', kind: 'lost' },
  ],
  lexicon: { people: 'Attendees', person: 'Attendee', offerings: 'Events', offering: 'Event' },
  recommendedAddons: ['marketing'],
  nextBestActions: [
    { label: 'Set up ticket tiers', surface: 'space.offerings' },
    { label: 'Show the door code', surface: 'space.offerings' },
  ],
}

// Event Space · membership: recurring access.
const EVENT_MEMBERSHIP: ModeProfile = {
  type: 'event_space',
  variant: 'membership',
  modeLabel: 'Event space',
  focusLabel: 'Recurring access',
  tagline: 'Offer recurring access and keep members coming through the door.',
  navEmphasis: ['members', 'checkin', 'qr', 'tickets'],
  defaultToggles: ['members', 'qr', 'checkin'],
  pipeline: [
    { name: 'Interested', kind: 'open' },
    { name: 'Trial', kind: 'open' },
    { name: 'Member', kind: 'won' },
    { name: 'Lapsed', kind: 'lost' },
  ],
  lexicon: { people: 'Members', person: 'Member', offerings: 'Events', offering: 'Event' },
  recommendedAddons: ['marketing'],
  nextBestActions: [
    { label: 'Invite a member', surface: 'space.people' },
    { label: 'Show the door code', surface: 'space.offerings' },
  ],
}

// Organization · donations (default): giving + supporters.
const ORG_DONATIONS: ModeProfile = {
  type: 'organization',
  variant: 'donations',
  modeLabel: 'Nonprofit',
  focusLabel: 'Donations and supporters',
  tagline: 'Raise money, grow your supporters, and tell your impact story.',
  navEmphasis: ['donations', 'crm', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr', 'donations'],
  pipeline: [
    { name: 'Prospect', kind: 'open' },
    { name: 'First gift', kind: 'open' },
    { name: 'Recurring', kind: 'won' },
    { name: 'Lapsed', kind: 'lost' },
    { name: 'Reactivated', kind: 'won' },
  ],
  lexicon: { people: 'Supporters', person: 'Supporter', offerings: 'Programs', offering: 'Program' },
  recommendedAddons: ['marketing'],
  nextBestActions: [
    { label: 'Set up your fund', surface: 'space.offerings' },
    { label: 'Thank a supporter', surface: 'space.engage.crm' },
  ],
}

// Organization · programs: enrollment + impact.
const ORG_PROGRAMS: ModeProfile = {
  type: 'organization',
  variant: 'programs',
  modeLabel: 'Nonprofit',
  focusLabel: 'Programs and enrollment',
  tagline: 'Run programs, enroll participants, and report your impact.',
  navEmphasis: ['enroll', 'crm', 'members', 'email', 'qr'],
  defaultToggles: ['members', 'qr', 'enroll'],
  pipeline: [
    { name: 'Prospect', kind: 'open' },
    { name: 'Applied', kind: 'open' },
    { name: 'Enrolled', kind: 'open' },
    { name: 'Completed', kind: 'won' },
    { name: 'Withdrew', kind: 'lost' },
  ],
  lexicon: { people: 'Participants', person: 'Participant', offerings: 'Programs', offering: 'Program' },
  recommendedAddons: ['marketing'],
  nextBestActions: [
    { label: 'Define a program', surface: 'space.offerings' },
    { label: 'Welcome a participant', surface: 'space.comms' },
  ],
}

// Lab · cohort (default): experiments / cohorts (internal for now).
const LAB_COHORT: ModeProfile = {
  type: 'lab',
  variant: 'cohort',
  modeLabel: 'Lab',
  focusLabel: 'Experiments and cohorts',
  tagline: 'Run experiments with cohorts and gather the people in the room.',
  navEmphasis: ['members', 'qr'],
  defaultToggles: ['members', 'qr'],
  pipeline: [
    { name: 'New', kind: 'open' },
    { name: 'Active', kind: 'open' },
    { name: 'Won', kind: 'won' },
    { name: 'Lost', kind: 'lost' },
  ],
  lexicon: { people: 'Regulars', person: 'Regular', offerings: 'Sessions', offering: 'Session' },
  recommendedAddons: [],
  nextBestActions: [{ label: 'Invite a regular', surface: 'space.people' }],
}

/** Every registered ModeProfile, keyed `${type}:${variant}`. The default Focus per type is in
 *  DEFAULT_VARIANT above. A new Mode/Focus is one entry here + (if a new Focus) its DEFAULT_VARIANT
 *  line, never a core edit. */
const MODES: Record<string, ModeProfile> = {
  'business:service': BUSINESS_SERVICE,
  'business:product': BUSINESS_PRODUCT,
  'coaching:packages': COACHING_PACKAGES,
  'coaching:cohort': COACHING_COHORT,
  'practitioner:appointments': PRACTITIONER_APPOINTMENTS,
  'practitioner:programs': PRACTITIONER_PROGRAMS,
  'event_space:ticketed': EVENT_TICKETED,
  'event_space:membership': EVENT_MEMBERSHIP,
  'organization:donations': ORG_DONATIONS,
  'organization:programs': ORG_PROGRAMS,
  'lab:cohort': LAB_COHORT,
}

function key(type: SpaceType, variant: ModeVariant): string {
  return `${type}:${variant}`
}

/** Is `value` a registered Focus variant id? (Closed set; an unknown value is not a ModeVariant.) */
export function isModeVariant(value: unknown): value is ModeVariant {
  return typeof value === 'string' && Object.values(MODES).some((m) => m.variant === value)
}

/** The default Focus variant for a Mode (type), or null when the type has no Mode (root / unknown). */
export function defaultVariantForType(type: SpaceType | null | undefined): ModeVariant | null {
  if (!type) return null
  return DEFAULT_VARIANT[type] ?? null
}

/** The Focus variants a Mode (type) offers, default first then declaration order. Empty for a type
 *  with no Mode (root / unknown). */
export function listVariantsForType(type: SpaceType | null | undefined): ModeProfile[] {
  if (!type) return []
  const all = Object.values(MODES).filter((m) => m.type === type)
  const def = DEFAULT_VARIANT[type]
  return all.sort((a, b) => {
    if (a.variant === def) return -1
    if (b.variant === def) return 1
    return 0
  })
}

/** Does this Mode (type) offer more than one Focus? (Drives whether the switcher shows a Focus picker.) */
export function modeHasFocusChoice(type: SpaceType | null | undefined): boolean {
  if (!type) return false
  return listVariantsForType(type).length > 1
}

/**
 * Resolve the ModeProfile for a Space's `(type, mode_variant)`.
 *   - A registered exact `(type, variant)` wins.
 *   - A null / unknown / out-of-Mode variant falls back to the type's DEFAULT variant.
 *   - A type with no registered Mode (root / unknown) returns null, so the caller falls open to the
 *     generic console (Mode never gates: a missing Mode is "no preset", not "no access").
 * PURE + total.
 */
export function resolveMode(
  type: SpaceType | null | undefined,
  variant?: string | null,
): ModeProfile | null {
  if (!type) return null
  // An exact registered match for the requested variant.
  if (typeof variant === 'string' && key(type, variant as ModeVariant) in MODES) {
    return MODES[key(type, variant as ModeVariant)]!
  }
  // Fall back to the type's default Focus.
  const def = DEFAULT_VARIANT[type]
  if (def && key(type, def) in MODES) return MODES[key(type, def)]!
  return null
}

/** Every registered ModeProfile (for the create wizard's "what do you run?" picker + tests), in
 *  declaration order. */
export function listModes(): ModeProfile[] {
  return Object.values(MODES)
}

/** One "what do you run?" choice for the create wizard (Space Modes M3, plan §3a): a plain headline, a
 *  one-line tagline, and the (type, variant) it maps to. */
export interface ModeChoice {
  /** A stable id for the radio group (`${type}:${variant}`). */
  id: string
  /** The Space type (the Mode) this choice provisions. */
  type: SpaceType
  /** The Focus sub-mode this choice provisions. */
  variant: ModeVariant
  /** The plain headline, e.g. "Coach". */
  label: string
  /** A one-line plain tagline, e.g. "Packages and scheduling". */
  hint: string
}

// The wizard's curated "what do you run?" order (plan §3a). One row per meaningful operating model, each
// a (type, variant). This is the FRONT DOOR copy: plain headlines a member self-selects. Kept as an
// explicit list (not every registered Mode) so the picker stays the 7 operator-true choices the plan
// specifies, while the registry can carry more variants for the switcher.
const WIZARD_CHOICES: readonly { type: SpaceType; variant: ModeVariant; label: string; hint: string }[] = [
  { type: 'coaching', variant: 'packages', label: 'Coach', hint: 'Packages and scheduling' },
  { type: 'business', variant: 'service', label: 'Service business', hint: 'Bookings and quotes' },
  { type: 'business', variant: 'product', label: 'Product business', hint: 'Catalog and storefront' },
  { type: 'business', variant: 'service', label: 'Studio or gym', hint: 'Classes and memberships' },
  { type: 'practitioner', variant: 'appointments', label: 'Practitioner', hint: '1:1 sessions' },
  { type: 'organization', variant: 'donations', label: 'Nonprofit', hint: 'Programs and donations' },
  { type: 'event_space', variant: 'ticketed', label: 'Event space', hint: 'Tickets and check in' },
]

/** The create wizard's "what do you run?" choices, in plan §3a order. Only choices whose (type, variant)
 *  resolves to a registered Mode are returned (defensive: a renamed variant never shows a dead choice). */
export function listModeChoices(): ModeChoice[] {
  return WIZARD_CHOICES.filter((c) => resolveMode(c.type, c.variant)?.variant === c.variant).map((c) => ({
    id: `${c.type}:${c.variant}`,
    type: c.type,
    variant: c.variant,
    label: c.label,
    hint: c.hint,
  }))
}

// ── Operator overrides of the Mode preset (spaces.preferences, Space Modes M3) ─────────────────────
// The operator can OVERRIDE any preset facet from the Mode settings page; the override is persisted to
// spaces.preferences.mode and merged OVER the Mode defaults so operator override ALWAYS wins and a later
// re-preset only refills what the operator has NOT touched. PURE: the normalizer + merge take plain data
// in, plain data out, so they are unit-testable and safe to import anywhere. FRAMING only, never a gate.

/** The operator overrides we persist under `spaces.preferences.mode`. Every field is OPTIONAL: a missing
 *  field means "not set by the operator", so the Mode default applies for that facet (and a re-preset is
 *  free to refill it). Sparse by design: only a hand-set value is stored. */
export interface ModePreferences {
  /** Override of a function's nav label (the lexicon / module label the operator renamed). Keyed by
   *  SpaceFunctionKey -> the operator's label. */
  labels?: Partial<Record<SpaceFunctionKey, string>>
  /** Override of a default toggle: true forces a module ON in the nav, false forces it OFF, regardless of
   *  the Mode's defaultToggles. (Capability stays gated elsewhere; this is nav framing only.) */
  toggles?: Partial<Record<SpaceFunctionKey, boolean>>
  /** Override of the nav emphasis ORDER (a hand-sorted list of SpaceFunctionKeys). When present it wins
   *  over the Mode's navEmphasis. */
  navOrder?: SpaceFunctionKey[]
}

/** Normalize a raw `spaces.preferences` blob into a typed, validated ModePreferences. Tolerant of any
 *  shape (a malformed blob yields {}). Drops any unknown function key so a stale value never reaches the
 *  resolver. PURE. */
export function readModePreferences(raw: unknown): ModePreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const root = raw as Record<string, unknown>
  const node = root.mode
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {}
  const m = node as Record<string, unknown>
  const out: ModePreferences = {}

  if (m.labels && typeof m.labels === 'object' && !Array.isArray(m.labels)) {
    const labels: Partial<Record<SpaceFunctionKey, string>> = {}
    for (const [k, v] of Object.entries(m.labels as Record<string, unknown>)) {
      if (isKnownFunctionKey(k) && typeof v === 'string' && v.trim()) labels[k] = v.trim()
    }
    if (Object.keys(labels).length) out.labels = labels
  }

  if (m.toggles && typeof m.toggles === 'object' && !Array.isArray(m.toggles)) {
    const toggles: Partial<Record<SpaceFunctionKey, boolean>> = {}
    for (const [k, v] of Object.entries(m.toggles as Record<string, unknown>)) {
      if (isKnownFunctionKey(k) && typeof v === 'boolean') toggles[k] = v
    }
    if (Object.keys(toggles).length) out.toggles = toggles
  }

  if (Array.isArray(m.navOrder)) {
    const order = (m.navOrder as unknown[]).filter(isKnownFunctionKey)
    if (order.length) out.navOrder = order
  }

  return out
}

/** The EFFECTIVE nav emphasis after operator overrides: the operator's hand-sorted navOrder if set, else
 *  the Mode's navEmphasis, then any toggled-ON function appended (operator turned it on) and any
 *  toggled-OFF function removed (operator turned it off). PURE. Used by the console to order modules with
 *  the operator's choices winning over the preset (Space Modes M3 "operator overrides win"). */
export function effectiveNavEmphasis(
  mode: ModeProfile | null,
  prefs: ModePreferences,
): readonly SpaceFunctionKey[] {
  const base = prefs.navOrder ?? mode?.navEmphasis ?? []
  const off = new Set(
    Object.entries(prefs.toggles ?? {})
      .filter(([, on]) => on === false)
      .map(([k]) => k as SpaceFunctionKey),
  )
  const on = Object.entries(prefs.toggles ?? {})
    .filter(([, isOn]) => isOn === true)
    .map(([k]) => k as SpaceFunctionKey)
  const ordered = base.filter((k) => !off.has(k))
  for (const k of on) if (!ordered.includes(k)) ordered.push(k)
  return ordered
}

/** The EFFECTIVE label for a function under a Mode + overrides: the operator's label override if set,
 *  else null (the caller falls back to the function's own registry label). PURE. */
export function effectiveLabel(prefs: ModePreferences, fn: SpaceFunctionKey): string | null {
  return prefs.labels?.[fn] ?? null
}

// A small local guard so this pure module does not import the function registry's runtime (avoids a
// cycle: functions.ts may grow to read modes later). The SpaceFunctionKey union is the source of truth;
// this list mirrors it and is asserted exhaustive at compile time via the satisfies check below.
const KNOWN_FUNCTION_KEYS = [
  'crm',
  'email',
  'members',
  'qr',
  'availability',
  'memberships',
  'donations',
  'enroll',
  'tickets',
  'checkin',
  'billing',
  'profile',
] as const satisfies readonly SpaceFunctionKey[]

function isKnownFunctionKey(value: unknown): value is SpaceFunctionKey {
  return typeof value === 'string' && (KNOWN_FUNCTION_KEYS as readonly string[]).includes(value)
}
