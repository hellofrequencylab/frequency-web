// THE LAST THEME KIT SOMEONE LOOKED AT (Daniel, 2026-11-04: whoever reaches the 12 minute launch has the theme they were
// looking at applied). A /themes/<theme> page writes this first-party cookie; /create-a-space and /launch/start read it
// when the address names no kit of its own (an explicit ?kit= always wins). Only kits the builder offers are ever written
// or read (isPreviewKit), so a hidden kit never rides. First-party only: never sent to pixels or analytics.

import { isPreviewKit, kitAccentIndex } from './preview-site'
import type { MegaThemeId } from '@/lib/theme/mega-theme'

const LAST_KIT_COOKIE = 'fq_last_kit'
const MAX_AGE = 60 * 60 * 24 * 30

/** The kit in a cookie header or document.cookie string, or null. Total. */
export function lastKitFrom(cookieString: string | null | undefined): MegaThemeId | null {
  const m = new RegExp(`(?:^|;\\s*)${LAST_KIT_COOKIE}=([a-z0-9-]{1,40})`).exec(cookieString ?? '')
  return m && isPreviewKit(m[1]) ? m[1] : null
}

/** Browser only: remember the kit being viewed. A kit the builder does not offer is ignored. */
export function rememberKit(kit: string): void {
  if (typeof document === 'undefined' || !isPreviewKit(kit)) return
  document.cookie = `${LAST_KIT_COOKIE}=${kit}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`
}

const LAST_ACCENT_COOKIE = 'fq_last_accent'

/** The accent name last picked in the builder, from a cookie string, or null. Total. Whether it fits a kit is
 *  asked of kitAccentIndex, so the same name on a kit without it is simply ignored. */
export function lastAccentFrom(cookieString: string | null | undefined): string | null {
  const m = new RegExp(`(?:^|;\\s*)${LAST_ACCENT_COOKIE}=([A-Za-z0-9%._-]{1,40})`).exec(cookieString ?? '')
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}

/** The place in `kit`'s accent list the remembered accent holds, or null when none is remembered or the kit lacks it. */
export function lastAccentAt(kit: string, cookieString: string | null | undefined): number | null {
  return kitAccentIndex(kit, lastAccentFrom(cookieString))
}

/** Browser only: remember the accent picked in the builder (by name, kit lists differ). */
export function rememberAccent(name: string): void {
  if (typeof document === 'undefined' || !/^[A-Za-z0-9 ._-]{1,40}$/.test(name)) return
  document.cookie = `${LAST_ACCENT_COOKIE}=${encodeURIComponent(name)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`
}
