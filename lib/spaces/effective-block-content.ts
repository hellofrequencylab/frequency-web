import type { SpaceContentData } from './content-data'

// EFFECTIVE DATA-BLOCK CONTENT for the rail editor (bug fix, ADR-542 follow-up). The live render of the
// About / Story data blocks (components/widgets/space-profile/about.tsx + story.tsx) shows the operator's
// inline-authored bag when present, but FALLS BACK to the space's central data (About: the `spaces.about`
// column, threaded as `data.aboutShort`; Story: the longer narrative `data.profile.about`) and to the
// block's default eyebrow/heading. The in-rail editor panel (components/entity-blocks/block-edit-panel.tsx)
// binds its fields to the persisted authored bag ALONE, so a space whose story lives in the central data
// showed a LIVE section with prose but EMPTY editor fields.
//
// This pure adapter closes that gap: given the space's live content data + the persisted authored bag, it
// returns the bag the editor should SEED with, pre-filling each DATA block's eyebrow / title / body from the
// SAME effective values the live render uses, but only where the operator has not already authored an
// override (an authored value always wins, exactly like the render). PURE + FAIL-SAFE: no IO; an empty data
// bag simply yields the persisted content unchanged.
//
// SEED-ONLY, never a silent write: seeding does not schedule a save (the store only persists on an edit),
// and the LIVE grid renders DATA blocks from their server node, not this bag (live-profile-grid.tsx) — so
// pre-filling the fields changes what the operator SEES to edit, never what renders or what is stored until
// they actually type. When they then edit any field, the pre-filled prose is promoted to an explicit
// override, which is the expected "the text I saw is the text I keep" behavior.

/** The default eyebrow / heading each DATA block renders when the operator has authored none (mirrors the
 *  fallbacks in components/widgets/space-profile/about.tsx + story.tsx — keep these in lockstep). */
const DATA_BLOCK_HEADER_DEFAULTS: Readonly<Record<string, { eyebrow: string; title: string }>> = {
  about: { eyebrow: 'About', title: 'About this space' },
  story: { eyebrow: 'About', title: 'Our story' },
}

/** The effective BODY fallback for a DATA block: the central data the live render falls back to. About reads
 *  the short intro (`spaces.about` → data.aboutShort); Story reads the longer narrative (profileData.about →
 *  data.profile.about). Any other block has no central body. */
function effectiveBodyFor(id: string, data: SpaceContentData | null | undefined): string | undefined {
  if (!data) return undefined
  if (id === 'about') return data.aboutShort?.trim() || undefined
  if (id === 'story') return data.profile?.about?.trim() || undefined
  return undefined
}

/** Fold the effective eyebrow / title / body into ONE block's authored bag: an authored (non-empty) value is
 *  kept as-is; a missing one is pre-filled from the effective fallback so the editor field shows it. Returns
 *  the SAME reference when nothing changes, so an unaffected block keeps its identity (stable seed). */
function withEffectiveBlock(
  id: string,
  bag: Record<string, unknown> | undefined,
  data: SpaceContentData | null | undefined,
): Record<string, unknown> | undefined {
  const headers = DATA_BLOCK_HEADER_DEFAULTS[id]
  const body = effectiveBodyFor(id, data)
  // Nothing to pre-fill for this id (not a headered/bodied data block, or no central data).
  if (!headers && body === undefined) return bag

  const authoredEyebrow = typeof bag?.eyebrow === 'string' && bag.eyebrow.trim() ? bag.eyebrow : undefined
  const authoredTitle = typeof bag?.title === 'string' && bag.title.trim() ? bag.title : undefined
  const authoredBody = typeof bag?.body === 'string' && bag.body.trim() ? bag.body : undefined

  const next: Record<string, unknown> = { ...bag }
  if (headers && !authoredEyebrow) next.eyebrow = headers.eyebrow
  if (headers && !authoredTitle) next.title = headers.title
  if (body !== undefined && !authoredBody) next.body = body

  // If we added nothing, hand back the original reference so the seed stays stable.
  const changed =
    (headers && (!authoredEyebrow || !authoredTitle)) || (body !== undefined && !authoredBody)
  return changed ? next : bag
}

/**
 * Return the per-block content map the rail editor should SEED with: the persisted authored content with each
 * DATA block's eyebrow / title / body pre-filled from the space's effective (fallback) content, so every
 * block editor opens showing the section's CURRENT content instead of empty placeholders. PURE + FAIL-SAFE:
 * `data` null (the editor / a member Spotlight) or empty ⇒ the persisted map is returned as-is.
 */
export function withEffectiveDataContent(
  content: Record<string, Record<string, unknown>> | undefined,
  data: SpaceContentData | null | undefined,
): Record<string, Record<string, unknown>> {
  const base = content ?? {}
  if (!data) return base
  const out: Record<string, Record<string, unknown>> = { ...base }
  for (const id of Object.keys(DATA_BLOCK_HEADER_DEFAULTS)) {
    const merged = withEffectiveBlock(id, base[id], data)
    if (merged) out[id] = merged
  }
  return out
}
