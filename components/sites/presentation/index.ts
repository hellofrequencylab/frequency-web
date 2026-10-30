import type { RoleId } from '@/lib/blocks/roles/roles'
import type { WebsiteTheme } from '@/lib/sites/editor/state'
import dawn from './dawn'
import designer from './designer'
import freeHuman from './free-human'
import menswork from './menswork'
import midnight from './midnight'
import network from './network'
import networkKit from './network-kit'
import temple from './temple'
import templeKit from './temple-kit'
import wildheart from './wildheart'

// THE PRESENTATION LAYER (docs/THEME-COHESION.md section 2, ADR-1923, LIVE-1861). A theme never names a role block;
// it supplies the layout each role takes by default, so the same Hero block is full-bleed on Nocturne and split on
// Network. Only a block with no layout picked follows the theme; a layout the owner chose stays through a switch.
// Defaults only: no new art. DAWN is empty, so it draws each role's own default.

export type PresentationDefaults = Partial<Record<RoleId, string>>

const BY_THEME: Record<WebsiteTheme, PresentationDefaults> = {
  DAWN: dawn, Menswork: menswork, Midnight: midnight, Wildheart: wildheart, Network: network, NetworkKit: networkKit,
  Temple: temple, TempleKit: templeKit, Designer: designer, FreeHuman: freeHuman,
}

/** The layout this theme draws a role in when the owner has not picked one, or undefined for the role's own default. */
export function presentationDefault(theme: unknown, role: RoleId): string | undefined {
  return typeof theme === 'string' ? BY_THEME[theme as WebsiteTheme]?.[role] : undefined
}
