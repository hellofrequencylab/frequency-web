// Where the marketing funnel's "start a Space" links go: the signed-out builder, with ?kit=<MegaThemeId> when the
// page knows the Theme Kit, and &accent=<name> when it knows the accent picked beside it. Only the seven kits in PREVIEW_KIT_ORDER are offered there, so any other id is left
// off and the builder opens on its cold default (arrivalFromParam). Signed-in /spaces/new is not touched.

import { ROUTES } from '@/lib/frequency/site-nav'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'

export function createSpaceHref(kit?: string | null, accent?: string | null): string {
  if (!kit || !(PREVIEW_KIT_ORDER as readonly string[]).includes(kit)) return ROUTES.createSpace
  // The accent picked beside the Use button rides along (lib/create-space/door.ts reads it); anything odd is left off.
  const a = accent && /^[a-z0-9#-]{1,40}$/i.test(accent) ? `&accent=${encodeURIComponent(accent.toLowerCase())}` : ''
  return `${ROUTES.createSpace}?kit=${kit}${a}`
}
