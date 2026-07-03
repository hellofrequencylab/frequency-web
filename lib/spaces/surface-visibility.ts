// PER-SURFACE VISIBILITY (ADR-508 U4-B). PURE + framework-independent (no React / Next / Supabase),
// so it is trivially unit-testable, like its sibling lib/spaces/profile-layout.ts. It answers: "given
// one entity data model rendered onto several surfaces (the in-app Space, the public Spotlight, the
// external Website), which block TYPES are hidden on a given surface?" — the sync primitive that lets
// one Puck doc paint different surfaces without duplicating content.
//
// KEYED ON BLOCK TYPE, NOT INSTANCE ID. A surface hides a block by its stable TYPE name (e.g.
// 'SpaceOfferings'), so the rule survives a doc edit that re-ids or re-orders blocks. Stored at
// spaces.preferences.surfaceVisibility as { [surface]: { hiddenTypes?: string[] } }.
//
// FAIL-SAFE throughout: a malformed / absent blob reads as "nothing hidden" (the surface shows
// everything), so a bad preferences row never blanks a surface. No em dashes (CONTENT-VOICE §10).

import type { Data } from '@/lib/page-editor/types'

/** The three surfaces one entity data model renders onto. `website` is the external public micro-site
 *  (/sites/<slug>); `space` is the in-app profile; `spotlight` is the public member/entity spotlight. */
export type SiteSurface = 'website' | 'space' | 'spotlight'

/** The per-surface rule set: the block TYPE names hidden on that surface. */
export interface SurfaceRules {
  hiddenTypes: string[]
}

/** The three known surfaces. Only these keys are ever read off the stored blob (an unknown surface key
 *  is ignored), so a forged / stale surface never widens what a real surface hides. */
const KNOWN_SURFACES: readonly SiteSurface[] = ['website', 'space', 'spotlight']

/** Keep only non-empty, de-duplicated string type names from an unknown array; a non-array yields []. */
function cleanTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const type = v.trim()
    if (!type || seen.has(type)) continue
    seen.add(type)
    out.push(type)
  }
  return out
}

/** A fresh all-empty visibility model (every surface hides nothing). */
function emptyVisibility(): Record<SiteSurface, SurfaceRules> {
  return {
    website: { hiddenTypes: [] },
    space: { hiddenTypes: [] },
    spotlight: { hiddenTypes: [] },
  }
}

/**
 * Fail-safe read of the per-surface visibility off a preferences blob. Reads
 * `preferences.surfaceVisibility`, keeps only the three known surfaces, and for each keeps only string
 * type entries in its `hiddenTypes`. Anything that is not a plain object (a wrong shape, an array, a
 * primitive, absent) yields the all-empty model (nothing hidden anywhere). Pure + total.
 */
export function parseSurfaceVisibility(preferences: unknown): Record<SiteSurface, SurfaceRules> {
  const out = emptyVisibility()
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return out
  const raw = (preferences as Record<string, unknown>).surfaceVisibility
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const rec = raw as Record<string, unknown>
  for (const surface of KNOWN_SURFACES) {
    const entry = rec[surface]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    out[surface] = { hiddenTypes: cleanTypes((entry as Record<string, unknown>).hiddenTypes) }
  }
  return out
}

/** Is a block TYPE hidden on a given surface? Fail-safe false for an unknown surface or a malformed
 *  blob (nothing is hidden), so a filter built on this shows everything by default. */
export function isTypeHiddenOnSurface(type: string, surface: SiteSurface, preferences: unknown): boolean {
  if (!KNOWN_SURFACES.includes(surface)) return false
  return parseSurfaceVisibility(preferences)[surface].hiddenTypes.includes(type)
}

/**
 * Return a NEW `Data` doc with every top-level block whose `.type` is hidden for `surface` REMOVED,
 * AND every hidden-type block removed from inside any `SpaceLayout` block's `main` / `side` slot arrays
 * (mirrors the SpaceLayout-slot traversal the landing's stripIdentityHeader uses). PURE + tolerant: a
 * non-array `content`, or a non-array slot, passes through untouched, and an unknown surface / malformed
 * blob hides nothing (an equivalent doc). Never mutates the input.
 */
export function filterDocForSurface(data: Data, surface: SiteSurface, preferences: unknown): Data {
  const hidden = new Set(
    KNOWN_SURFACES.includes(surface) ? parseSurfaceVisibility(preferences)[surface].hiddenTypes : [],
  )
  const isHidden = (b: unknown): boolean =>
    typeof (b as { type?: unknown })?.type === 'string' && hidden.has((b as { type: string }).type)
  const cleanSlot = (arr: unknown): unknown =>
    Array.isArray(arr) ? arr.filter((b) => !isHidden(b)) : arr

  if (!Array.isArray(data.content)) return { ...data }
  const content = data.content
    .filter((b) => !isHidden(b))
    .map((b) => {
      if (b.type !== 'SpaceLayout') return b
      const props = b.props as Record<string, unknown>
      return { ...b, props: { ...props, main: cleanSlot(props.main), side: cleanSlot(props.side) } }
    })
  return { ...data, content }
}
