// Per-item menu drift for the Menu manager (LIVE-111, ADR-1134).
//
// The weekly sweep (scripts/maintenance/menu-drift.mjs) could already see the header drifting
// from the code defaults; the operator standing in the Menu manager could not — and LIVE-107's
// mislabelled "Spaces directory" row was created by an operator in that editor, who had no way
// to see the row had left its default behind. This module is the half that faces a person: a
// pure derivation the editor can run on every keystroke, so drift is visible at the moment of
// the edit rather than in a report a maintainer reads a week later.
//
// THE CLASSIFICATION is a pure function of three inputs:
//   1. the resolved menu the editor is holding (DB rows, or the code fallback),
//   2. defaultMenu(surfaceKey) — the code side,
//   3. the menus row's `synced_default_keys` baseline — every default href this surface has
//      ever synced. It is the ONLY thing that can tell RETIRED from MISSING: an absent default
//      whose href is in the baseline was deliberately removed and the inserts-only sync
//      (lib/menus/actions.ts::syncMenuFromDefaults) will never resurrect it; one that is NOT in
//      the baseline is genuinely new and the next sync injects it.
//
// Per LIVE item (keyed by row id):
//   synced — the row's href is a code default and its operator-owned presentation (label,
//            subheading, shown/hidden mode) still matches it.
//   edited — the href is a code default but the presentation diverged; `changed` names how.
//   custom — the href matches no code default. Operator-added, and NOT drift: the weekly
//            comparison deliberately refuses to call these a finding, and so does this.
//   Access gates are deliberately NOT compared: since the gate contract (lib/menus/gates.ts,
//   owner decision 2026-08-06) the registry OVERWRITES every known href's gate at read time,
//   so a resolved menu's gates structurally cannot drift from code.
//
// Per ABSENT default (a code default no live row points at):
//   retired — in `synced_default_keys`: removed here on purpose; sync will never restore it.
//   missing — not in the baseline: the next sync adds it.
//   Either may additionally carry `mislabelledAs`: a live row wears this default's label but
//   points somewhere else — LIVE-107's member-facing defect, surfaced to its author.
//
// REUSE, not resemblance: the retired/missing split IS the weekly job's unreachable/pending,
// consumed from the ONE comparison both instruments share (lib/menus/drift-core.mjs). This file
// adds only what the weekly job has no use for — per-row identity and the field-level diff.
//
// PURE: no React, no Supabase, no DOM — testable without a browser (drift.test.ts).

import { compare } from './drift-core.mjs'
import { isPinnedRailItem } from './defaults'
import type { ResolvedCategory, ResolvedItem, ResolvedMenu } from './types'

/** How one live row relates to the code default sharing its href. */
export type ItemDrift =
  | { state: 'synced' }
  | { state: 'edited'; changed: EditedField[] }
  | { state: 'custom' }

/** The operator-owned fields the edited diff inspects. */
export type EditedField = 'label' | 'subheading' | 'visibility'

/** A code default no live row points at, split by the `synced_default_keys` baseline. */
export type AbsentDefault = {
  label: string
  href: string
  /** retired = in the baseline, the sync will never bring it back; missing = new, the next sync adds it. */
  state: 'retired' | 'missing'
  /** When a live row wears this default's label but points elsewhere, the href it points at. */
  mislabelledAs?: string
}

export type MenuDrift = {
  /** Live item id → its drift state. The fixed pinned rail row is skipped (it has no DB row). */
  items: Record<string, ItemDrift>
  /** Code defaults absent from this menu, in code-default order. */
  absentDefaults: AbsentDefault[]
}

/** Flatten a resolved menu to its leaf items (root + every nested category), skipping the
 *  runtime-injected pinned rail row on both sides — it is never a DB row and never syncs. */
function leaves(menu: ResolvedMenu): ResolvedItem[] {
  const out: ResolvedItem[] = []
  const add = (items: ResolvedItem[]) => {
    for (const it of items) if (it.href && !isPinnedRailItem(it.id)) out.push(it)
  }
  add(menu.rootItems)
  const walk = (cats: ResolvedCategory[]) => {
    for (const c of cats) {
      add(c.items)
      walk(c.children)
    }
  }
  walk(menu.categories)
  return out
}

/** The field-level diff behind an `edited` badge. Empty = synced. */
function diffFields(live: ResolvedItem, def: ResolvedItem): EditedField[] {
  const changed: EditedField[] = []
  if (live.label !== def.label) changed.push('label')
  if ((live.subheading ?? '') !== (def.subheading ?? '')) changed.push('subheading')
  if (live.mode !== def.mode) changed.push('visibility')
  return changed
}

/**
 * Classify every row of a resolved menu against the code defaults for its surface.
 *
 * @param menu               the menu the editor holds (its live working state)
 * @param def                defaultMenu(menu.surfaceKey) — the code side
 * @param syncedDefaultKeys  the menus row's `synced_default_keys` baseline (empty for a
 *                           never-synced surface)
 */
export function deriveMenuDrift(
  menu: ResolvedMenu,
  def: ResolvedMenu,
  syncedDefaultKeys: string[],
): MenuDrift {
  const defLeaves = leaves(def)
  const liveLeaves = leaves(menu)

  // The shared comparison decides which defaults are absent and how each absence reads.
  const r = compare(
    defLeaves.map((l) => ({ label: l.label, href: l.href })),
    { items: liveLeaves.map((l) => ({ label: l.label, href: l.href })), syncedDefaultKeys },
  )

  const baseline = new Set(syncedDefaultKeys)
  const retired = new Set(r.unreachable.map((l) => l.href))
  const missing = new Set(r.pending.map((l) => l.href))
  const mislabelled = new Map(r.mislabelled.map((m) => [m.expected, m.actual]))

  // Emit absences in code-default order so the panel reads like the registry, not like the
  // comparison's internal buckets. A mislabelled default is still absent BY HREF; the shared
  // comparison files it separately, so classify it against the baseline the same way it would
  // have been had no row worn its label.
  const absentDefaults: AbsentDefault[] = []
  for (const leaf of defLeaves) {
    if (retired.has(leaf.href) || missing.has(leaf.href)) {
      absentDefaults.push({
        label: leaf.label,
        href: leaf.href,
        state: retired.has(leaf.href) ? 'retired' : 'missing',
      })
    } else if (mislabelled.has(leaf.href)) {
      absentDefaults.push({
        label: leaf.label,
        href: leaf.href,
        state: baseline.has(leaf.href) ? 'retired' : 'missing',
        mislabelledAs: mislabelled.get(leaf.href),
      })
    }
  }

  // Per-row classification. First declaration wins on a duplicate default href, matching how
  // gates.ts resolves the same tie.
  const defByHref = new Map<string, ResolvedItem>()
  for (const leaf of defLeaves) if (!defByHref.has(leaf.href)) defByHref.set(leaf.href, leaf)

  const items: Record<string, ItemDrift> = {}
  for (const live of liveLeaves) {
    const d = defByHref.get(live.href)
    if (!d) {
      items[live.id] = { state: 'custom' }
      continue
    }
    const changed = diffFields(live, d)
    items[live.id] = changed.length === 0 ? { state: 'synced' } : { state: 'edited', changed }
  }

  return { items, absentDefaults }
}
