import { parseEntityLayout, resolveRows } from './layout'
import type { EntityKind } from './registry'

// ── "Does this draft actually look different to a visitor?" ───────────────────────────────
//
// 🔴 THE BUG THIS EXISTS FOR. The Space page draft/publish split decided "there are unpublished
// changes" from the mere PRESENCE of `preferences.profileLayoutDraft`, plus a raw comparison of the
// two stored nodes. Both are wrong in the same direction: they report a difference that a visitor
// cannot see, and nothing ever clears it.
//
// Autosave writes the draft on every edit; only Publish deletes it. So an owner who dragged one
// block and then hit Undo still had a draft key, and the stored node could not round-trip to equal
// the published one:
//
//   • a Space that never published a layout has NO `profileLayout` at all, so the published side is
//     literally `null` while the draft is a full rows object — unequal forever, though both render
//     the same starter;
//   • hiding a block keeps its id in `rows.cells` AND in `hidden` (rows-ops), while the seed path
//     strips it from the cells, so the two encodings of one arrangement never matched as bytes.
//
// The consequence was not cosmetic: the flag arms a `beforeunload` prompt and a `window.confirm`
// on EVERY admin-rail dismissal, so one edit-then-undo left the owner confirming a dialog on their
// own Space forever, with no exit but publishing a change they had already rejected.
//
// The fix is to compare what RENDERS, not what is stored. Both sides go through the same
// parse + resolveRows pipeline the renderer uses, so the two encodings above normalise to the same
// value and an absent published node resolves to the starter it actually draws.

/** JSON with object keys sorted at every depth, so two logically identical values compare equal
 *  regardless of the order their keys happen to be serialised in. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

/**
 * A stable string identifying everything about a stored layout node that a VISITOR can perceive:
 * the resolved rows (the arrangement actually drawn), the authored per-block content, and the
 * per-block style. Two nodes with the same key render identically.
 *
 * Takes the RAW stored value (`preferences.profileLayout` / `...Draft`, possibly null/garbage) —
 * parseEntityLayout is total and fail-safe, so an absent or malformed node resolves to the starter
 * exactly as the renderer would draw it.
 *
 * ⚠️ NOT a claim that equal keys mean equal bytes. It is deliberately looser: normalising through
 * the render pipeline is the whole point.
 */
export function layoutRenderKey(raw: unknown, kind: EntityKind): string {
  const parsed = parseEntityLayout(raw)
  return canonicalJson({
    rows: resolveRows(parsed, kind),
    content: parsed?.content ?? null,
    style: parsed?.style ?? null,
  })
}

/**
 * True when a draft node would draw exactly what the published node draws.
 *
 * ⚠️ ONE KNOWN RESIDUAL, deliberately left. The live editor seeds its store with the EFFECTIVE
 * block content (withEffectiveDataContent folds the Space's central data into the authored bag so
 * every editor field opens pre-filled), and the first autosave persists that enriched bag. On a
 * Space whose PUBLISHED node predates that seeding, the draft therefore carries content keys the
 * published node lacks even though both render the same text, because the published render falls
 * back to the same central data. This function reports that as a difference.
 *
 * It is under-reported rather than over-reported by choice: content is the one thing here a visitor
 * definitely sees, so treating a content difference as "no change" would hide a real edit. The
 * escape is explicit instead of inferred — the publish bar offers Discard, which deletes the draft
 * outright. The residual also clears itself the first time the owner publishes, since the published
 * node then carries the enriched bag too.
 */
export function layoutRendersSame(draftRaw: unknown, publishedRaw: unknown, kind: EntityKind): boolean {
  return layoutRenderKey(draftRaw, kind) === layoutRenderKey(publishedRaw, kind)
}
