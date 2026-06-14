// The theme COOKIE — the client-safe serialization of a member's chosen theme axes
// (generation / skin / occasion). Deliberately has NO 'server-only' guard and imports
// NOTHING from next/headers, so the client-side writer (a small toggle component) and the
// server resolver (lib/theme/server/resolve.ts) can share this one parse/serialize pair.
//
// The cookie is the member's OVERRIDE: when present it wins over the Space default and the
// system/time default (precedence lives in the server resolver). Parsing validates each
// field through the registry guards and DROPS anything unknown, so a stale or hand-edited
// cookie can never push an invalid axis into the shell — it just falls back.

import {
  type GenerationId,
  isGenerationId,
} from './generations'
import {
  type SkinId,
  isSkinId,
} from './skins'
import {
  type OccasionId,
  isOccasionId,
} from './occasions'

/** The cookie name. Short + neutral so it reads cleanly in the jar (`fxtheme`). */
export const THEME_COOKIE = 'fxtheme'

/** The member's stored theme override. Every field is optional — only set axes are written. */
export interface ThemeCookie {
  /** Chosen generation (feel/age axis), if the member picked one. */
  gen?: GenerationId
  /** Chosen skin (palette axis), if the member picked one. */
  skin?: SkinId
  /** Chosen occasion (seasonal accent), if the member pinned one. */
  occ?: OccasionId
}

/**
 * Parse a raw cookie value into a validated ThemeCookie. JSON-decodes, then keeps only the
 * fields whose value passes its registry guard; everything else (bad JSON, wrong shape,
 * unknown ids) is dropped. NEVER throws — a malformed cookie yields `{}` so the resolver
 * cleanly falls back to the Space/system defaults.
 */
export function parseThemeCookie(raw: string | undefined): ThemeCookie {
  if (!raw) return {}
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof data !== 'object' || data === null) return {}

  const out: ThemeCookie = {}
  const record = data as Record<string, unknown>
  if (typeof record.gen === 'string' && isGenerationId(record.gen)) out.gen = record.gen
  if (typeof record.skin === 'string' && isSkinId(record.skin)) out.skin = record.skin
  if (typeof record.occ === 'string' && isOccasionId(record.occ)) out.occ = record.occ
  return out
}

/** Serialize a ThemeCookie to its stored string form (JSON). */
export function serializeThemeCookie(value: ThemeCookie): string {
  return JSON.stringify(value)
}

/**
 * The cookie attributes the CLIENT writer appends to `document.cookie`. One-year max-age,
 * site-wide path, lax same-site (the cookie is a non-sensitive UI preference, read on
 * navigation). Server writers should mirror these via the cookies() set options.
 */
export const THEME_COOKIE_ATTRS = 'path=/; max-age=31536000; samesite=lax'
