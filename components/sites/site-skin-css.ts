import { HOUSE_CSS } from './house-css'
import { MENSWORK_CSS } from './menswork-css'
import { MENSWORK_PAGE_CSS } from './menswork-page-css'
import { FREQUENCY_PAGE_CSS } from './frequency-page-css'
import { WILDHEART_CSS } from './wildheart-css'
import { NETWORK_CSS } from './network-css'
import { TEMPLE_CSS } from './temple-css'
import { MIDNIGHT_CSS } from './midnight-css'
import { TEMPLE_KIT_CSS } from './temple-kit-css'
import { NETWORK_KIT_CSS } from './network-kit-css'
import { DESIGNER_CSS } from './designer-css'
import { FREE_HUMAN_CSS } from './free-human-css'
import { NEW_WORLD_CSS } from './new-world-css'
import { CYBERWITCH_CSS } from './cyberwitch-css'
import { NEW_WORLD_DIALS_CSS } from './new-world-dials-css'
import { SERVICES_SITE_CSS } from './services-css'
import { SITE_LOOK_CSS } from './site-look-css'
import type { SiteLook } from '@/lib/theme/site-style'

const SKINS = {
  menswork: MENSWORK_CSS + MENSWORK_PAGE_CSS,
  wildheart: FREQUENCY_PAGE_CSS + WILDHEART_CSS,
  network: FREQUENCY_PAGE_CSS + NETWORK_CSS,
  'network-kit': FREQUENCY_PAGE_CSS + NETWORK_KIT_CSS,
  temple: FREQUENCY_PAGE_CSS + TEMPLE_CSS,
  'temple-kit': FREQUENCY_PAGE_CSS + TEMPLE_KIT_CSS,
  midnight: FREQUENCY_PAGE_CSS + MIDNIGHT_CSS,
  designer: FREQUENCY_PAGE_CSS + DESIGNER_CSS,
  'free-human': FREQUENCY_PAGE_CSS + FREE_HUMAN_CSS,
  'new-world': FREQUENCY_PAGE_CSS + NEW_WORLD_CSS + NEW_WORLD_DIALS_CSS,
  cyberwitch: FREQUENCY_PAGE_CSS + CYBERWITCH_CSS,
  services: FREQUENCY_PAGE_CSS + SERVICES_SITE_CSS,
}

export type SiteSkinName = keyof typeof SKINS
export const SITE_SKIN_NAMES = Object.keys(SKINS) as SiteSkinName[]

export function siteSkinCss(theme: SiteSkinName | undefined, look: Partial<SiteLook> = {}): string {
  const lookCss = look.corners || look.spacing || look.header ? SITE_LOOK_CSS : ''
  // Network Kit reads its radius tokens after the owner’s layout choices set them.
  if (theme === 'network-kit') return HOUSE_CSS + FREQUENCY_PAGE_CSS + lookCss + NETWORK_KIT_CSS
  return HOUSE_CSS + (theme ? SKINS[theme] : '') + lookCss
}
