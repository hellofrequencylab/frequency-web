// PURE helper for the mobile Spotlight live preview: turn a Puck `Data` document into the
// ordered list of TAPPABLE top-level blocks the preview renders. Each entry pairs a block's
// stable id (Puck stores it at `props.id`) with a single-item document `{ root, content:[item] }`
// so the preview can render each block through the client <Render> inside its own tappable
// wrapper — the cleanest way to map a tap back to the exact block id without a brittle DOM walk.
//
// PURE (no React/IO) so it round-trips in a unit test and is safe to import from the client
// preview. It must NOT live in a 'use server' file (it is a plain helper exported for tests).

import type { Data } from '@/lib/page-editor/types'

export interface PreviewBlock {
  /** The block's stable id (from `props.id`). Falls back to the index when absent so a
   *  malformed item still renders + maps to a usable key. */
  id: string
  /** A single-item Puck document rendering ONLY this block, for <Render>. */
  doc: Data
}

/**
 * Split a Puck document into per-block preview entries, preserving order. Total: a null/empty
 * document yields an empty list; an item missing an id gets an index-based fallback id so it
 * still renders (and a tap still targets something stable within this render pass).
 */
export function toPreviewBlocks(data: Data | null | undefined): PreviewBlock[] {
  const content = Array.isArray(data?.content) ? data!.content : []
  return content.map((item, index) => {
    const rawId = (item?.props as { id?: unknown } | undefined)?.id
    const id = typeof rawId === 'string' && rawId ? rawId : `block-${index}`
    return { id, doc: { root: data?.root ?? {}, content: [item] } }
  })
}
