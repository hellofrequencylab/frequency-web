// THE LAST THEME KIT SOMEONE LOOKED AT (Daniel, 2026-11-04: whoever reaches the 12 minute launch has the theme they were
// looking at applied). A /themes/<theme> page writes this first-party cookie; /create-a-space and /launch/start read it
// when the address names no kit of its own (an explicit ?kit= always wins). Only kits the builder offers are ever written
// or read (isPreviewKit), so a hidden kit never rides. First-party only: never sent to pixels or analytics.

import { isPreviewKit } from './preview-site'
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
