import type { ResolvedMenuLink } from './site-menu'

// Shared by the live Space profile menu and its server-side navigation resolver.
export interface SpaceProfileTab {
  href: string
  label: string
  /** The menu key (lib/spaces/site-menu.ts), when the tab came from the automatic set. `home` marks Home. */
  key?: string
  /** A custom link off the Space (opens in a new tab). */
  external?: boolean
  /** A dropdown from the saved menu: drawn as the mega panel (space-menu-dropdown.tsx). */
  mega?: ResolvedMenuLink['mega']
}
