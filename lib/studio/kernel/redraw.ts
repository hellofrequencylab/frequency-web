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
 */
export function lockedPaths(manifest: EntityManifest, locked: readonly string[]): string[] {
  const keys = new Set(declaredLockKeys(manifest, locked))
  if (keys.size === 0) return []
  const paths = new Set<string>()
  for (const f of manifest.fields) {
    if (keys.has(f.section) || keys.has(f.path)) paths.add(f.path)
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
