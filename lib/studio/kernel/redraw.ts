// ─────────────────────────────────────────────────────────────────────────────
// EDIT RE-ENTRY — the redraw helpers (docs/STUDIO.md, ADR-450 §2, ADR-994).
//
// The two things a redraw needs that a one-shot creation never did:
//
//   LOCK   resolve the pin an author pressed ("keep the practice as is") into the concrete
//          FIELD PATHS a redraw must not write. The pin is honoured by DELETING those paths
//          from the patch, not by asking the model nicely, so a pin holds even when Vera
//          ignores the instruction. A pin that survives nothing would be a lie.
//
//   DIFF   say what actually moved. When an agent rewrites existing content, the author's job
//          is "is this better?", which they can only answer if they can see the change without
//          hunting for it.
//
// PURE and ENTITY-BLIND, like the rest of the kernel: no React, no Next, no Supabase, and never an
// import from lib/studio/entities. It takes a manifest as an argument and knows nothing about which
// one, which is why it belongs in the kernel and not beside it. `pnpm check:studio` enforces that.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldDef } from './manifest'
import { moodToneDirective, normalizeSeedMood } from './moods'

/** Render a scalar as display text. Mirrors the kernel's own reader. PURE + total. */
function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** Walk a dotted path off a record. Undefined at any dead end. PURE + total. */
function at(scope: Record<string, unknown>, path: string): unknown {
  let cur: unknown = scope
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** The display value of one declared field against a draft. PURE. */
function valueOf(def: Pick<FieldDef, 'path' | 'read'>, draft: Record<string, unknown>): string {
  return def.read ? def.read(draft) : str(at(draft, def.path))
}

// ── LOCK ─────────────────────────────────────────────────────────────────────────────────

/**
 * The lock keys an entity actually declares (`steer.lock`). Anything else a caller sends is
 * DROPPED rather than honoured: a pin the manifest never offered has no defined meaning, and
 * silently accepting one would let a client invent protection that the server cannot keep.
 */
export function declaredLockKeys(manifest: EntityManifest, requested: readonly string[]): string[] {
  const offered = new Set(manifest.steer?.lock ?? [])
  return [...new Set(requested)].filter((k) => offered.has(k))
}

/**
 * The FIELD PATHS a set of pins protects. A lock key names either a section (every field in it
 * is pinned, which is how "keep the practice as is" covers hook, description, and guide at once)
 * or a single field path. Unknown keys resolve to nothing.
 *
 * REPEATS COUNT (ADR-996). A pin may name a whole repeated collection, and two of the three
 * entities that generalized this actually do: a Circle offers `agreements` and a Journey offers
 * `arc`, and NEITHER declares a plain field in that section. Walking only `manifest.fields`
 * resolved both to zero paths, so the pin rendered, the author pressed it, and it protected
 * nothing. That gap was invisible on the Practice (which pins `content`, three ordinary fields)
 * and would have stayed invisible until an author lost their group's own agreements to a redraw.
 * A collection is protected at its `arrayPath`, which is the key a patch writes it under.
 */
export function lockedPaths(manifest: EntityManifest, locked: readonly string[]): string[] {
  const keys = new Set(declaredLockKeys(manifest, locked))
  if (keys.size === 0) return []
  const paths = new Set<string>()
  for (const f of manifest.fields) {
    if (keys.has(f.section) || keys.has(f.path)) paths.add(f.path)
  }
  for (const r of manifest.repeats ?? []) {
    if (keys.has(r.section) || keys.has(r.arrayPath)) paths.add(r.arrayPath)
  }
  return [...paths]
}

/** The human name for one lock key: its section title, else its field label, else the key. PURE. */
export function lockLabel(manifest: EntityManifest, key: string): string {
  return (
    manifest.sections.find((s) => s.key === key)?.title ??
    manifest.fields.find((f) => f.path === key)?.label ??
    key
  )
}

/**
 * The human name for ONE declared path: a field's own label, or a repeated collection's section
 * title (a collection has no label of its own, and "Agreements" is what the author calls it).
 * Falls back to the raw path so a diff row is never nameless. PURE.
 */
export function pathLabel(manifest: EntityManifest, path: string): string {
  const field = manifest.fields.find((f) => f.path === path)
  if (field) return field.label
  const repeat = (manifest.repeats ?? []).find((r) => r.arrayPath === path)
  if (repeat) return manifest.sections.find((s) => s.key === repeat.section)?.title ?? path
  return path
}

/**
 * Strip every locked path out of a patch. THIS is what makes a redraw safe to press: the pin is
 * enforced by removal, so it holds whatever the model returned. Returns a new object; the input
 * is untouched.
 */
export function applyLock<T extends object>(
  manifest: EntityManifest,
  locked: readonly string[],
  patch: T,
): Partial<T> {
  const blocked = new Set(lockedPaths(manifest, locked))
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!blocked.has(key)) out[key] = value
  }
  return out as Partial<T>
}

// ── DIFF ─────────────────────────────────────────────────────────────────────────────────

/** ONE field that moved, named the way the author knows it. */
export interface FieldChange {
  path: string
  label: string
  before: string
  after: string
}

/**
 * What changed between two drafts, in manifest order and using the manifest's own labels. Only
 * fields the entity DECLARES are compared, so a redraw can never report a change to something
 * the author has no name for. PURE.
 */
export function changedFields(
  manifest: EntityManifest,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const out: FieldChange[] = []
  for (const f of manifest.fields) {
    const from = valueOf(f, before)
    const to = valueOf(f, after)
    if (from === to) continue
    out.push({ path: f.path, label: f.label, before: from, after: to })
  }
  return out
}

// ── THE SHARED SPINE (ADR-996) ───────────────────────────────────────────────────────────
//
// ADR-994 shipped edit re-entry for the Practice alone, on purpose, so a second entity could
// prove the shape before it was copied four times. Three more entities later, this is what
// actually generalized, and what did not:
//
//   SHARED   the brief (mood + directions + the pins, in one voice), the lock, the diff, and
//            the "nothing moved" answer. All PURE, all here.
//   PER      the authorization gate, WHICH Vera planner is called, and the mapping between that
//   ENTITY   planner's own vocabulary and the manifest's field paths. Those are three genuinely
//            different things per entity and forcing them into one function would be a lie.
//
// Every caller therefore walks the same four steps:
//   1. pins   = declaredLockKeys(manifest, requested)
//   2. safe   = applyLock(manifest, pins, rawProposal)     <- THE GUARANTEE (the delete)
//   3. settle = settleRedraw({ ... })                      <- the diff, in manifest order
//   4. write only the paths `settle.changes` names.
// A pinned path is deleted at step 2 and re-checked at step 3, so it can reach neither the
// comparison nor the write, whatever Vera returned.

/** Display text for one raw value: a scalar as itself, a list of strings joined, anything else
 *  empty. This is what makes a repeated collection diffable beside a plain field. PURE + total. */
export function displayText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).join(', ')
  }
  return str(value)
}

/** Display text for a whole path-keyed record. PURE. */
export function displayRecord(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) out[key] = displayText(value)
  return out
}

/**
 * The brief a redraw sends Vera: what to do, the mood's tone line, the author's own directions,
 * and the pins named the way the author named them.
 *
 * The pins are stated here as a COURTESY. `applyLock` is the guarantee. Saying so in one place
 * stops each entity from inventing its own wording for the same promise.
 */
export function redrawBrief(input: {
  manifest: EntityManifest
  /** The one-line instruction that opens the brief, e.g. "Draft this Circle again". */
  lead: string
  mood?: unknown
  directions?: string | null
  /** The requested pins. Filtered to what the manifest offers before they are named. */
  locked?: readonly string[]
}): string {
  const pins = declaredLockKeys(input.manifest, input.locked ?? [])
  const kept = pins.map((k) => lockLabel(input.manifest, k))
  const directions = (input.directions ?? '').trim().slice(0, 600)
  return [
    input.lead,
    moodToneDirective(normalizeSeedMood(input.mood)),
    directions ? `How to approach it: ${directions}` : '',
    kept.length ? `Leave this exactly as it is, word for word: ${kept.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** What one settled redraw amounts to: what the pins held, what moved, and the paths to write. */
export interface RedrawSettlement {
  /** The human names of the pins that were honoured, for the "kept as is" line. */
  kept: string[]
  /** Every declared path that actually moved, in manifest order, old value beside new. */
  changes: FieldChange[]
  /** Just the paths, for a caller assembling its own write patch. Never holds a pinned path. */
  changedPaths: string[]
}

/**
 * Lock, then diff. Given the entity's CURRENT state and Vera's PROPOSAL, both keyed by manifest
 * field path and both already rendered as display text, return what genuinely moved.
 *
 * Three rules it enforces so no entity has to:
 *   • Pinned paths are DELETED from the proposal before anything is compared, so a pin holds even
 *     when the model ignored the instruction.
 *   • A path the manifest never declared is ignored, so a redraw can never report a change to
 *     something the author has no name for.
 *   • An unchanged value is not a change, so "Vera kept this one as it is" is an honest answer
 *     rather than a silent no-op write.
 * PURE.
 */
export function settleRedraw(input: {
  manifest: EntityManifest
  locked?: readonly string[]
  current: Record<string, string>
  proposed: Record<string, string>
}): RedrawSettlement {
  const { manifest, current, proposed } = input
  const pins = declaredLockKeys(manifest, input.locked ?? [])
  // The delete, again. The caller has already stripped its raw patch; doing it here too means a
  // caller that forgets still cannot leak a pinned field into the diff.
  const safe = applyLock(manifest, pins, proposed)

  const order = [
    ...manifest.fields.map((f) => f.path),
    ...(manifest.repeats ?? []).map((r) => r.arrayPath),
  ]

  const changes: FieldChange[] = []
  for (const path of order) {
    const after = (safe as Record<string, string | undefined>)[path]
    if (typeof after !== 'string') continue
    const before = current[path] ?? ''
    if (after === before) continue
    changes.push({ path, label: pathLabel(manifest, path), before, after })
  }

  return {
    kept: pins.map((k) => lockLabel(manifest, k)),
    changes,
    changedPaths: changes.map((c) => c.path),
  }
}
