'use client'

import { createContext, useContext } from 'react'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import type { WebRole } from '@/lib/core/roles'
import type { Rail } from '@/lib/layout/page-chrome'

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
  /** The saved chrome override for the CURRENT route, or null to follow the code
   *  default — handed to the on-page Page settings so it needs no extra fetch. */
  chromeOverride: Rail | null
}

const Ctx = createContext<PageAdminCtx>({
  role: null,
  staffRole: null,
  webRole: 'none',
  chromeOverride: null,
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
