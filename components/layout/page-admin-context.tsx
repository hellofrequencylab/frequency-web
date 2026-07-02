'use client'

import { createContext, useContext } from 'react'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import type { WebRole } from '@/lib/core/roles'
import type { Capability } from '@/lib/core/capabilities'
import type { AppOverrides } from '@/lib/apps/overrides'

// Carries the viewer's role + staff role to the on-page Settings bar
// (components/layout/page-admin-bar) so it can render INSIDE the page templates'
// header (under the title) without every template threading the props through.
// The provider is a client ancestor in the app shell; the bar (a client component
// nested in server templates) consumes it.

interface PageAdminCtx {
  role: CommunityRole | null
  staffRole: StaffRole | null
  /** The viewer's STAFF web_role (ADR-208), view-as-aware. Gates the staff-only
   *  on-page "Page" settings group (admin+); 'none' under a downgrade preview. */
  webRole: WebRole
  /** The viewer's resolved capabilities for THIS page's admin scope, when the server seam has
   *  threaded them (LP4 step B2, docs/LOOM-PLATFORM.md §5). Absent today: the settings panel selects
   *  manage modules caps-blind and each module self-gates server-side. Present ⇒ the panel gates its
   *  catalog selection (appsForScope) on the real set, and bar visibility can switch to showsAdminBar. */
  caps?: ReadonlySet<Capability>
  /** Per-scope operator App overrides for THIS page's admin scope (docs/ADMIN-RAIL.md Phase 6),
   *  loaded once per request by the shell (loadAppOverrides). Merged over the catalog Apps in the
   *  settings panel (mergeAppOverrides + the min_role gate). FAIL-SAFE: absent ⇒ treated as `{}` ⇒
   *  the catalog defaults, so the rail is unchanged until overrides are threaded + saved. */
  appOverrides?: AppOverrides
}

const Ctx = createContext<PageAdminCtx>({
  role: null,
  staffRole: null,
  webRole: 'none',
})

export function PageAdminProvider({
  value,
  children,
}: {
  value: PageAdminCtx
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePageAdmin(): PageAdminCtx {
  return useContext(Ctx)
}
