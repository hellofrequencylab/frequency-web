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
  type GalleryItem,
  type SpotlightStatKey,
  type BlockTint,
  EMPTY_LAYOUT,
  SPOTLIGHT_LAYOUT_VERSION,
  SPOTLIGHT_STAT_KEYS,
  MAX_BLOCKS,
  MAX_LINKS_PER_BLOCK,
  MAX_GALLERY_IMAGES,
  HEADING_MAX,
  TEXT_MAX,
  QUOTE_MAX,
  CITE_MAX,
  LABEL_MAX,
  ALT_MAX,
} from './schema'
import { validateEmbedRef } from '../embeds'

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

/** A per-block colour override: strict 6-digit hex only (same boundary as the theme), so a
 *  tampered tint can at worst contribute fewer colours, never injected CSS. Returns undefined
 *  when nothing valid is present, so the block stays untinted. */
const HEX6 = /^#[0-9a-fA-F]{6}$/
function safeTint(v: unknown): BlockTint | undefined {
  if (!v || typeof v !== 'object') return undefined
  const t = v as Record<string, unknown>
  const out: BlockTint = {}
  if (typeof t.text === 'string' && HEX6.test(t.text)) out.text = t.text.toLowerCase()
  if (typeof t.bg === 'string' && HEX6.test(t.bg)) out.bg = t.bg.toLowerCase()
  return out.text || out.bg ? out : undefined
}

/** Coerce one raw block to a safe block, or null to drop it whole (never partial). */
function coerceBlock(raw: unknown, index: number, ownerAuthUserId: string): SpotlightBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const id = safeId(b.id, index)
  const tint = safeTint(b.tint)
  const t = tint ? { tint } : {}

  switch (b.type) {
    case 'heading': {
      const text = clampStr(b.text, HEADING_MAX).trim()
      if (!text) return null
      const level = b.level === 3 ? 3 : 2
      return { id, type: 'heading', text, level, ...t }
    }
    case 'text': {
      const text = clampStr(b.text, TEXT_MAX).trim()
      if (!text) return null
      return { id, type: 'text', text, ...t }
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
      return { id, type: 'links', items, ...t }
    }
    case 'image': {
      const assetPath = safeAssetPath(b.assetPath, ownerAuthUserId)
      if (!assetPath) return null
      // Crop framing: same clamp boundary as the background (focal 0–100, zoom 100–200).
      return {
        id, type: 'image', assetPath, alt: clampStr(b.alt, ALT_MAX),
        focusX: clampN(b.focusX, 0, 100, 50),
        focusY: clampN(b.focusY, 0, 100, 50),
        zoom: clampN(b.zoom, 100, 200, 100),
      }
    }
    case 'gallery': {
      const rawItems = Array.isArray(b.items) ? b.items.slice(0, MAX_GALLERY_IMAGES) : []
      const items: GalleryItem[] = []
      for (const it of rawItems) {
        if (!it || typeof it !== 'object') continue
        const item = it as Record<string, unknown>
        const assetPath = safeAssetPath(item.assetPath, ownerAuthUserId)
        if (!assetPath) continue // drop any item outside the owner's own folder
        // Per-image crop framing: same clamp boundary as the background.
        items.push({
          assetPath, alt: clampStr(item.alt, ALT_MAX),
          focusX: clampN(item.focusX, 0, 100, 50),
          focusY: clampN(item.focusY, 0, 100, 50),
          zoom: clampN(item.zoom, 100, 200, 100),
        })
      }
      if (items.length === 0) return null
      return { id, type: 'gallery', items }
    }
    case 'quote': {
      const text = clampStr(b.text, QUOTE_MAX).trim()
      if (!text) return null
      const cite = clampStr(b.cite, CITE_MAX).trim()
      return cite ? { id, type: 'quote', text, cite, ...t } : { id, type: 'quote', text, ...t }
    }
    case 'stats': {
      const rawShow = Array.isArray(b.show) ? b.show : []
      const show: SpotlightStatKey[] = []
      for (const k of rawShow) {
        if (SPOTLIGHT_STAT_KEYS.includes(k as SpotlightStatKey) && !show.includes(k as SpotlightStatKey)) {
          show.push(k as SpotlightStatKey)
        }
      }
      if (show.length === 0) return null
      return { id, type: 'stats', show }
    }
    case 'topfriends': {
      // The block carries no friend identities — only an optional grid title. The picks
      // live in the spotlight_top_friends table and are resolved server-side at render
      // (lib/spotlight/top-friends.ts), so a tampered blob can at worst rename the grid.
      const title = clampStr(b.title, LABEL_MAX).trim()
      return title ? { id, type: 'topfriends', title } : { id, type: 'topfriends' }
    }
    case 'embed': {
      // The read-side authority: only a (provider, ref) that matches the closed host
      // allowlist survives. The renderer reconstructs the iframe src from this — a member
      // never supplies a raw src.
      const e = validateEmbedRef(b.provider, b.ref)
      if (!e) return null
      return { id, type: 'embed', provider: e.provider, ref: e.ref }
    }
    case 'divider':
      return { id, type: 'divider', ...t }
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

/** Clamp a finite number into [lo, hi] (rounded), else the fallback. */
function clampN(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback
}

/** Validate the optional background image + dim + framing (focal point & zoom). */
export function validateSpotlightBackground(raw: unknown, ownerAuthUserId: string): SpotlightBackground {
  const base = { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 }
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  return {
    assetPath: safeAssetPath(r.assetPath, ownerAuthUserId),
    dim: clampN(r.dim, 0, 80, 0),
    focusX: clampN(r.focusX, 0, 100, 50),
    focusY: clampN(r.focusY, 0, 100, 50),
    zoom: clampN(r.zoom, 100, 200, 100),
  }
}
