import type { SpaceHubSection } from '@/lib/admin/modules/space-hub'
import { SpaceManageBoard } from './manage-board'

// THE MANAGE PANEL (the `?panel=manage` body). The Space "Manage" menu item soft-navigates here, so this
// swaps ONLY the profile body while the hero + menu stay put (no reload). It renders the SAME owner console
// as the standalone /manage page IN PLACE, under the header: the Community / Marketing / Offerings & Money /
// Content & Programs / Profile & Settings tabs and their content. There is no separate "full page" and no
// landing screen — the console lives on the profile.
//
// `?panel=manage&area=<section>` opens a tab; the console's own tabs soft-nav between areas through the SAME
// param (the `sectionHref` override), so switching tabs never leaves the page — the header + menu persist.
// No `area` opens the default section (the command-center Home, ADR-796). SpaceManageBoard self-gates on manage access (renders
// nothing for a non-manager), so this stays a thin pass-through. DAWN tokens, no em dashes.
export function ManageDashboard({ slug, area }: { slug: string; area?: string }) {
  return (
    <SpaceManageBoard
      slug={slug}
      section={area}
      sectionHref={(key: SpaceHubSection) => `/spaces/${slug}?panel=manage&area=${key}`}
    />
  )
}
