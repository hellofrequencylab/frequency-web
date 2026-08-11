// ─────────────────────────────────────────────────────────────────────────────
// THE STUDIO KERNEL — the entity manifest (docs/STUDIO.md, ADR-986).
//
// ONE declaration per creatable entity. Every wizard (the guided Spark), every review
// board, and every edit re-entry renders from this shape, so a change to the KERNEL lands
// in every entity at once and a change to an ENTITY lands nowhere else. This is the same
// locked-catalog law as SPACE_MODULES (ADR-553) and ENTITY_BLOCKS (ADR-508): behaviour is
// DECLARED here, never re-coded per surface.
//
// STRICT BOUNDARY (enforced by `pnpm check:studio`): nothing under lib/studio/kernel/ may
// import from lib/studio/entities/. The dependency arrow points one way only —
//     entities/*  ->  kernel/*  ->  (nothing)
// which is the mechanical guarantee behind "change a core element, it reflects site-wide".
//
// PURE: no React, no Next, no Supabase. Trivially testable, safe to import from a Server
// Component, a client surface, a server action, or a test alike.
//
// This supersedes the `lib/editing/schema.ts` sketch in ADR-450 §3 (never built). ADR-450 §2
// (the one Edit toggle + the two planes) is UNCHANGED and becomes this file's consumer: a
// field's `placement` is what lets ONE declaration serve creation (the Spark) and editing
// (the inline canvas + the Inspector rail) without the two ever drifting apart.
// ─────────────────────────────────────────────────────────────────────────────

// ── Field kinds ──────────────────────────────────────────────────────────────────────────

/**
 * The CLOSED set of field types a manifest may declare. Closed on purpose: a kind is a
 * promise that the kit renders it, the Spark can ask for it, and the review board can paint
 * it. Adding a kind is a deliberate kernel change (one entry here + one renderer) that every
 * entity then inherits; it is never something an entity bolts on locally.
 */
export const FIELD_KINDS = [
  // text
  'text',
  'longtext',
  'slug',
  'select',
  'tags',
  // contact + web
  'url',
  'email',
  'phone',
  'address',
  'hours',
  // commerce
  'price',
  'rating',
  'number',
  'duration',
  // time + place
  'date',
  'daterange',
  'cadence',
  'place',
  // media
  'image',
  'images',
  // flags
  'toggle',
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

/** Whether a string names a known field kind. Total. */
export function isFieldKind(v: string): v is FieldKind {
  return (FIELD_KINDS as readonly string[]).includes(v)
}

// ── Placement (the ADR-450 seam) ─────────────────────────────────────────────────────────

/**
 * WHERE a field is edited, across the entity's whole life:
 *  - `spark`  — asked during guided creation (the wizard's scoped questions). Also editable later.
 *  - `inline` — content that IS the page; edited in place on the live entity (ADR-450 inline canvas).
 *  - `rail`   — configuration; edited in the Inspector rail (ADR-450 rail plane).
 * One list, three filters. The Spark shows `spark`; Edit Mode splits `inline` from `rail`.
 * Absent === 'rail' (config by default; content opts in).
 */
export type FieldPlacement = 'spark' | 'inline' | 'rail'

// ── Field definition ─────────────────────────────────────────────────────────────────────

/**
 * ONE declared field. This is the DECLARATION; `FieldState` (review-kernel.ts) is its runtime
 * projection once a draft value, a confidence signal, and provenance are resolved against it.
 *
 * `path` is the draft field path the provenance ledger is also keyed by ('contact.phone').
 * Inside a `RepeatDef` it is RELATIVE to the item ('price'), and the kernel expands it to the
 * indexed form ('offerings[0].price') so the ledger key and the rendered row always agree.
 */
export interface FieldDef {
  path: string
  label: string
  kind: FieldKind
  /** The `SectionDef.key` this field groups under. */
  section: string
  placement?: FieldPlacement
  /** Creation cannot complete without it. Always asked in the Spark regardless of placement. */
  required?: boolean
  /**
   * PROSE: free narrative that can hide a commercial claim, so it publishes only when a
   * verified fact backs it OR nothing in the ledger claims it (hand-supplied === trusted).
   */
  prose?: boolean
  /**
   * COMMERCIAL FACT: a price / hours / address / phone / rating. May never auto-publish
   * without a cited, verified ledger entry. Re-checked server-side at apply; the board only
   * mirrors the gate, it never decides it.
   */
  commercial?: boolean
  /** Vera drafts this field. `false` means only a human (or a source) may fill it. */
  veraDrafts?: boolean
  /** Drop the row entirely when the read value is empty. Default: keep it (so gaps are visible). */
  omitWhenEmpty?: boolean
  /**
   * Derive the displayed string from the draft. Use for a composed value (a rating rendered
   * as "4.8 (126)") or a defaulted one. PURE. Absent === read the scalar at `path`.
   * Inside a repeat, `scope` is the ITEM, not the whole draft.
   */
  read?: (scope: Record<string, unknown>) => string
}

// ── Repeat groups ────────────────────────────────────────────────────────────────────────

/**
 * A repeated child collection (a Space's offerings, an Event's ticket tiers). The kernel walks
 * the array at `arrayPath` and emits `fields` once per item with indexed paths, so each item's
 * individually-gated facts (a price!) get their own reviewable, individually-cleared row.
 */
export interface RepeatDef {
  /** The array's path on the draft, e.g. 'offerings'. */
  arrayPath: string
  section: string
  /** A human name for one item, used to prefix its field labels. PURE. */
  itemLabel: (item: Record<string, unknown>, index: number) => string
  /** The per-item fields. Their `path` is relative to the item; `section` is inherited. */
  fields: Omit<FieldDef, 'section'>[]
}

// ── Sections ─────────────────────────────────────────────────────────────────────────────

/** A group of fields on the review board and in the rail. Array order === render order. */
export interface SectionDef {
  key: string
  title: string
  /** One line, plain, on what the section holds. Voice canon: no em dashes. */
  desc: string
}

// ── Kernel capability switches ───────────────────────────────────────────────────────────

/** What an entity's Spark will accept as source material on its first screen. */
export type SparkAccepts = 'url' | 'document' | 'image' | 'paste'

/**
 * How hard the entity verifies AI-drafted facts before they may publish:
 *  - `none`        — no ledger; everything the author writes publishes (a Practice, a Circle).
 *  - `citation`    — a fact needs a source snippet or a human confirm.
 *  - `adversarial` — plus the Opus refuter pass over every commercial fact (the Business Seeder).
 */
export type VerifyMode = 'none' | 'citation' | 'adversarial'

/** The steering dials the entity's Spark and re-seed expose (all kernel behaviour). */
export interface SteerCapabilities {
  /** The mood dial (kernel/moods.ts): tone, CTA posture, accent emphasis, page theme. */
  mood?: boolean
  /** The free-text "how should this be approached" box, folded into the AI brief. */
  directions?: boolean
  /** Field paths (or group names) a re-seed must not touch when locked, e.g. ['hero']. */
  lock?: readonly string[]
}

// ── The manifest ─────────────────────────────────────────────────────────────────────────

/**
 * ONE creatable entity, declared. The kernel + the kit read this; nothing else about the
 * entity's wizard, review board, or edit rail is written by hand.
 */
export interface EntityManifest {
  /** Stable id. Matches the registry key and the AI feature prefix. */
  entity: string
  /** Member- or operator-facing name (naming + voice canon). */
  label: string
  sections: readonly SectionDef[]
  fields: readonly FieldDef[]
  repeats?: readonly RepeatDef[]
  /** What the first screen's drop zone takes. Empty === no upload affordance. */
  accepts?: readonly SparkAccepts[]
  steer?: SteerCapabilities
  /** Default `none`: most entities have no ledger and publish what the author wrote. */
  verify?: VerifyMode
}

// ── Validation (what `pnpm check:studio` and the drift-guard tests assert) ────────────────

/** One thing wrong with a manifest, as a plain sentence. */
export type ManifestProblem = string

/**
 * Validate a manifest against the kernel's rules. PURE and total: returns the problems rather
 * than throwing, so the CI guard can report every one of them in a single pass instead of
 * failing on the first. An empty array means the manifest is well formed.
 */
export function validateManifest(m: EntityManifest): ManifestProblem[] {
  const problems: ManifestProblem[] = []
  const where = `[${m.entity}]`

  if (!m.entity.trim()) problems.push('An entity manifest needs a non-empty `entity` id.')
  if (!m.label.trim()) problems.push(`${where} needs a non-empty \`label\`.`)
  if (m.sections.length === 0) problems.push(`${where} declares no sections.`)

  const sectionKeys = new Set<string>()
  for (const s of m.sections) {
    if (sectionKeys.has(s.key)) problems.push(`${where} declares section "${s.key}" twice.`)
    sectionKeys.add(s.key)
  }

  const seenPaths = new Set<string>()
  const checkField = (f: Omit<FieldDef, 'section'> & { section?: string }, ctx: string) => {
    if (!f.path.trim()) problems.push(`${ctx} has a field with an empty \`path\`.`)
    if (!isFieldKind(f.kind)) {
      problems.push(`${ctx} field "${f.path}" uses unknown kind "${f.kind}". Add it to FIELD_KINDS with a renderer, or pick an existing kind.`)
    }
    if (f.section !== undefined && !sectionKeys.has(f.section)) {
      problems.push(`${ctx} field "${f.path}" points at section "${f.section}", which is not declared.`)
    }
  }

  for (const f of m.fields) {
    if (seenPaths.has(f.path)) problems.push(`${where} declares field path "${f.path}" twice.`)
    seenPaths.add(f.path)
    checkField(f, where)
  }

  for (const r of m.repeats ?? []) {
    if (!sectionKeys.has(r.section)) {
      problems.push(`${where} repeat "${r.arrayPath}" points at section "${r.section}", which is not declared.`)
    }
    if (r.fields.length === 0) problems.push(`${where} repeat "${r.arrayPath}" declares no fields.`)
    for (const f of r.fields) checkField(f, `${where} repeat "${r.arrayPath}"`)
  }

  // A commercial fact with no verification mode can never be cleared, so the board would
  // withhold it forever with no way for an operator to resolve it. Catch that at build time.
  const hasCommercial = m.fields.some((f) => f.commercial) || (m.repeats ?? []).some((r) => r.fields.some((f) => f.commercial))
  if (hasCommercial && (m.verify ?? 'none') === 'none') {
    problems.push(`${where} declares commercial fields but \`verify: 'none'\`, so they could never clear. Set verify to 'citation' or 'adversarial'.`)
  }

  return problems
}
