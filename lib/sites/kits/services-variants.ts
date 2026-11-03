import type { SiteKit } from './types'
import { newWorldKit } from './new-world-variants'

// Services' starter kits. The seven niche kits of the design system's revision 2 belong to New World and live in
// new-world-variants.ts (LIVE-2056). Until the Services thread builds its own trade kits, Services keeps the one General
// template every Mega Theme must name (lib/spaces/starter-site.ts): the New World General kit, worn by Services.

export function servicesKit(niche: 'general'): SiteKit {
  return { ...newWorldKit(niche), id: `services-${niche}`, theme: 'Services' }
}
