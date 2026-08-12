// ─────────────────────────────────────────────────────────────────────────────
// THE STUDIO KERNEL — the field model (docs/STUDIO.md, ADR-986).
//
// Turns (manifest + draft + ledger) into the flat, field-by-field model every review board
// renders: each field's value, its provenance, a confidence signal (✅/⚠️/🔴), whether the copy
// is AI-GENERATED, and whether it is WITHHELD pending a source or a human confirm.
//
// This is the generic half of what used to be the Business Seeder's `review-model.ts`. The
// business-specific half (which fields exist, what they are called, how they group) moved out
// to lib/studio/entities/business.ts as DATA. Nothing here knows what a business is, so a new
// entity gets the whole review story from one manifest and zero new render code.
//
// PURE + framework-independent (no React / Next / Supabase), so it is trivially unit-testable.
//
// HONEST BY CONSTRUCTION: the clearance rule below is the same one the server re-checks before
// anything publishes. The board can never promise a field will publish that the apply would
// withhold, because both read the same predicate over the same ledger.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldDef, FieldKind, FieldPlacement } from './manifest'
import {
  deriveSignal,
  isCleared,
  strongestEntry,
  type LedgerEntry,
  type ProvenanceLedger,
  type ReviewSignal,
} from './ledger'

// ── The runtime projection of a FieldDef ─────────────────────────────────────────────────

/**
 * ONE field, resolved. This is a `FieldDef` (the declaration) plus everything that only exists
 * once there is a draft and a ledger to read it against. The review board, the inline canvas,
 * and the Inspector rail all render from this one shape.
 */
export interface FieldState {
  /** The ledger key / field path, e.g. 'contact.phone' or 'offerings[0].price'. */
  path: string
  label: string
  kind: FieldKind
  section: string
  placement: FieldPlacement
  /** The current draft value, rendered as text (empty string when unset). */
  value: string
  signal: ReviewSignal
  /** The strongest supporting ledger entry, if any. */
  provenance?: {
    sourceUrl?: string
    snippet?: string
    confidence: number
    kind: LedgerEntry['kind']
    verifiedBy?: 'auto' | 'human'
  }
  /** True when this value was written by AI (kind 'generated' / 'inferred'). Marked on the board. */
  generated: boolean
  /** True when this is a commercial fact (price / hours / address / phone / rating). */
  commercial: boolean
  /** True when a gated value is NOT cleared to publish. Withheld until a source or a confirm. */
  withheld: boolean
  /** True when the apply is BLOCKED on this field (a contradicted commercial fact). */
  blocksApply: boolean
  /** Whether the value is editable inline. */
  editable: boolean
}

/** A group of resolved fields. */
export interface FieldSection {
  key: string
  title: string
  desc: string
  fields: FieldState[]
}

/** The whole resolved model for one draft. */
export interface FieldModel {
  sections: FieldSection[]
  /** Roll-up counts for the board header (the ✅/⚠️/🔴 legend + the withheld tally). */
  summary: {
    total: number
    green: number
    amber: number
    red: number
    withheld: number
    /** Any red field blocks the whole apply until it is resolved. */
    blocked: boolean
  }
}

// ── Reading values off a draft ───────────────────────────────────────────────────────────

/** Render any scalar as display text. Objects and arrays read as empty. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** Walk a dotted path ('contact.phone') off a record. Returns undefined at any dead end. PURE. */
function at(scope: Record<string, unknown>, path: string): unknown {
  let cur: unknown = scope
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** The display value for one field: its `read` override, else the scalar at its path. PURE. */
function readValue(def: Pick<FieldDef, 'path' | 'read'>, scope: Record<string, unknown>): string {
  return def.read ? def.read(scope) : str(at(scope, def.path))
}

// ── Resolving one field ──────────────────────────────────────────────────────────────────

/**
 * Project one declared field against the draft + ledger. `ledgerPath` is the fully indexed
 * path the ledger is keyed by (which differs from the declared path inside a repeat), and
 * `scope` is the record the value is read from (the draft, or the repeat's item).
 */
function resolveField(
  def: Omit<FieldDef, 'section'>,
  section: string,
  label: string,
  ledgerPath: string,
  scope: Record<string, unknown>,
  ledger: ProvenanceLedger,
): FieldState {
  const entries = ledger[ledgerPath]
  const entry = strongestEntry(entries)
  const commercial = !!def.commercial
  const prose = !!def.prose
  const generated = entry?.kind === 'generated' || entry?.kind === 'inferred'
  const signal = deriveSignal(entry, commercial)
  const value = readValue(def, scope)

  // The clearance rule, identical to the one the server re-checks:
  //   • a commercial fact clears only on a verified fact;
  //   • prose clears on a verified fact OR on NO ledger entry at all (hand-supplied is trusted);
  //   • everything else always clears.
  const cleared = commercial
    ? isCleared(entries)
    : prose
      ? !entries?.length || isCleared(entries)
      : true

  return {
    path: ledgerPath,
    label,
    kind: def.kind,
    section,
    placement: def.placement ?? 'rail',
    value,
    signal,
    generated,
    commercial,
    // An empty field cannot be "withheld" — there is nothing to hold back. It still surfaces
    // so the operator can see the gap.
    withheld: (commercial || prose) && !cleared && !!value,
    blocksApply: commercial && signal === 'red',
    editable: true,
    ...(entry
      ? {
          provenance: {
            sourceUrl: entry.sourceUrl,
            snippet: entry.snippet,
            confidence: entry.confidence ?? 0,
            kind: entry.kind,
            verifiedBy: entry.verifiedBy,
          },
        }
      : {}),
  }
}

// ── The model builder ────────────────────────────────────────────────────────────────────

/**
 * Build the full field model for one draft. PURE.
 *
 * Fields marked `omitWhenEmpty` drop out when they read empty; everything else surfaces even
 * when blank, so an operator can SEE what is missing rather than wonder. Sections render in
 * manifest order and empty ones are dropped.
 *
 * `draft` is deliberately loose (`Record<string, unknown>`): the kernel walks declared paths
 * and never needs the entity's concrete type, which is exactly what keeps it entity-agnostic.
 */
export function buildFieldModel(
  manifest: EntityManifest,
  draft: Record<string, unknown>,
  ledger: ProvenanceLedger = {},
): FieldModel {
  const bySection = new Map<string, FieldState[]>()
  const push = (state: FieldState) => {
    const list = bySection.get(state.section) ?? []
    list.push(state)
    bySection.set(state.section, list)
  }

  // Top-level fields, in declaration order.
  for (const def of manifest.fields) {
    const state = resolveField(def, def.section, def.label, def.path, draft, ledger)
    if (def.omitWhenEmpty && !state.value) continue
    push(state)
  }

  // Repeat groups: one row set per item, with indexed ledger paths so each item's own gated
  // facts (a price) clear independently of its siblings.
  for (const repeat of manifest.repeats ?? []) {
    const raw = at(draft, repeat.arrayPath)
    const items = Array.isArray(raw) ? raw : []
    items.forEach((rawItem, index) => {
      const item = (rawItem ?? {}) as Record<string, unknown>
      const itemLabel = repeat.itemLabel(item, index)
      for (const def of repeat.fields) {
        const ledgerPath = `${repeat.arrayPath}[${index}].${def.path}`
        const state = resolveField(def, repeat.section, `${itemLabel} · ${def.label}`, ledgerPath, item, ledger)
        if (def.omitWhenEmpty && !state.value) continue
        push(state)
      }
    })
  }

  let green = 0
  let amber = 0
  let red = 0
  let withheld = 0
  let total = 0
  for (const list of bySection.values()) {
    for (const f of list) {
      total++
      if (f.signal === 'green') green++
      else if (f.signal === 'red') red++
      else amber++
      if (f.withheld) withheld++
    }
  }

  const sections: FieldSection[] = manifest.sections
    .map((s) => ({ key: s.key, title: s.title, desc: s.desc, fields: bySection.get(s.key) ?? [] }))
    .filter((s) => s.fields.length > 0)

  return { sections, summary: { total, green, amber, red, withheld, blocked: red > 0 } }
}

// ── Placement filters (the ADR-450 seam in practice) ──────────────────────────────────────

/**
 * The fields a guided Spark asks for: everything placed in the Spark, plus anything `required`
 * (creation cannot complete without it, wherever it normally lives). ONE list, filtered, which
 * is what stops the wizard and the editor from ever drifting apart.
 */
export function sparkFields(manifest: EntityManifest): FieldDef[] {
  return manifest.fields.filter((f) => f.placement === 'spark' || f.required)
}

/**
 * The fields edited in place on the live entity (ADR-450 inline canvas).
 *
 * Includes PROSE fields the Spark asks for. A description is captured at creation AND is content
 * that belongs on the page afterwards, and forcing one property to express both meant an entity had
 * to choose between "the guided flow asks for it" and "the author can edit it in place" — so the
 * three commerce manifests picked `inline` and silently dropped Details from their own wizard.
 * Where a field is EDITED is derivable from what it is; it does not need a second declaration.
 */
export function inlineFields(manifest: EntityManifest): FieldDef[] {
  return manifest.fields.filter((f) => f.placement === 'inline' || (f.placement === 'spark' && f.prose))
}

/** The fields edited in the Inspector rail (ADR-450 rail plane). The default placement. */
export function railFields(manifest: EntityManifest): FieldDef[] {
  return manifest.fields.filter((f) => (f.placement ?? 'rail') === 'rail')
}
