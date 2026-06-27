// The Spotlight security boundary. A tampered `meta.spotlight` blob can reach the
// renderer (the public page reads it server-side), so validation runs on READ as well
// as write and is the authority. Pure, no IO/React, and FAIL-OPEN: it never throws —
// it drops or coerces anything outside the safe subset and returns a clean layout.
// Modeled on lib/theme/validate.ts.

import {
  type SpotlightBlock,
  type SpotlightLayout,
  type SpotlightBackground,
  type LinkItem,
  EMPTY_LAYOUT,
  SPOTLIGHT_LAYOUT_VERSION,
  MAX_BLOCKS,
  MAX_LINKS_PER_BLOCK,
  HEADING_MAX,
  TEXT_MAX,
  LABEL_MAX,
  ALT_MAX,
} from './schema'

function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

/** Only http/https URLs survive — kills javascript:/data:/vbscript: link injection. */
function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  try {
    const u = new URL(v.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** A storage path is only valid inside the OWNER's own Spotlight folder of the public
 *  bucket — `<authUserId>/spotlight/<name>.<ext>`. Pins to the rendering profile's own
 *  id (rejects `..`, leading `/`, and any foreign namespace). */
function safeAssetPath(v: unknown, ownerAuthUserId: string): string | null {
  if (typeof v !== 'string') return null
  const re = new RegExp(`^${ownerAuthUserId}/spotlight/[A-Za-z0-9_-]+\\.(webp|png|jpe?g|gif)$`)
  return re.test(v) ? v : null
}

function safeId(v: unknown, index: number): string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : `b_${index}`
}

/** Coerce one raw block to a safe block, or null to drop it whole (never partial). */
function coerceBlock(raw: unknown, index: number, ownerAuthUserId: string): SpotlightBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const id = safeId(b.id, index)

  switch (b.type) {
    case 'heading': {
      const text = clampStr(b.text, HEADING_MAX).trim()
      if (!text) return null
      const level = b.level === 3 ? 3 : 2
      return { id, type: 'heading', text, level }
    }
    case 'text': {
      const text = clampStr(b.text, TEXT_MAX).trim()
      if (!text) return null
      return { id, type: 'text', text }
    }
    case 'links': {
      const rawItems = Array.isArray(b.items) ? b.items.slice(0, MAX_LINKS_PER_BLOCK) : []
      const items: LinkItem[] = []
      for (const it of rawItems) {
        if (!it || typeof it !== 'object') continue
        const url = safeHttpUrl((it as Record<string, unknown>).url)
        if (!url) continue
        const label = clampStr((it as Record<string, unknown>).label, LABEL_MAX).trim() || new URL(url).host
        items.push({ label, url })
      }
      if (items.length === 0) return null
      return { id, type: 'links', items }
    }
    case 'image': {
      const assetPath = safeAssetPath(b.assetPath, ownerAuthUserId)
      if (!assetPath) return null
      return { id, type: 'image', assetPath, alt: clampStr(b.alt, ALT_MAX) }
    }
    case 'divider':
      return { id, type: 'divider' }
    default:
      return null // unknown type → drop
  }
}

/**
 * Validate a raw layout against the allowlist. Returns a clean SpotlightLayout — at
 * most MAX_BLOCKS, every block safe, never throws. `ownerAuthUserId` pins image asset
 * paths to the rendering profile's own folder.
 */
export function validateSpotlightLayout(raw: unknown, ownerAuthUserId: string): SpotlightLayout {
  if (!raw || typeof raw !== 'object') return EMPTY_LAYOUT
  const r = raw as Record<string, unknown>
  const rawBlocks = Array.isArray(r.blocks) ? r.blocks.slice(0, MAX_BLOCKS) : []
  const blocks: SpotlightBlock[] = []
  for (let i = 0; i < rawBlocks.length; i++) {
    const block = coerceBlock(rawBlocks[i], i, ownerAuthUserId)
    if (block) blocks.push(block)
  }
  return { version: SPOTLIGHT_LAYOUT_VERSION, blocks }
}

/** Validate the optional background image + dim. */
export function validateSpotlightBackground(raw: unknown, ownerAuthUserId: string): SpotlightBackground {
  if (!raw || typeof raw !== 'object') return { assetPath: null, dim: 0 }
  const r = raw as Record<string, unknown>
  const assetPath = safeAssetPath(r.assetPath, ownerAuthUserId)
  const dimRaw = typeof r.dim === 'number' && Number.isFinite(r.dim) ? r.dim : 0
  const dim = Math.max(0, Math.min(80, Math.round(dimRaw)))
  return { assetPath, dim }
}
