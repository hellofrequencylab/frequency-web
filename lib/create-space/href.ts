// Where the marketing funnel's "start a Space" links go: the signed-out builder, with ?kit=<MegaThemeId> when the
// page knows the Theme Kit. Only the seven kits in PREVIEW_KIT_ORDER are offered there, so any other id is left
// off and the builder opens on its cold default (arrivalFromParam). Signed-in /spaces/new is not touched.

import { ROUTES } from '@/lib/frequency/site-nav'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'

export function createSpaceHref(kit?: string | null): string {
  if (kit && (PREVIEW_KIT_ORDER as readonly string[]).includes(kit)) return `${ROUTES.createSpace}?kit=${kit}`
  return ROUTES.createSpace
}
