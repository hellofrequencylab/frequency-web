'use client'

import { createContext, useContext } from 'react'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'

// Carries the viewer's role + staff role to the on-page Settings bar
// (components/layout/page-admin-bar) so it can render INSIDE the page templates'
// header (under the title) without every template threading the props through.
// The provider is a client ancestor in the app shell; the bar (a client component
// nested in server templates) consumes it.

interface PageAdminCtx {
  role: CommunityRole | null
  staffRole: StaffRole | null
}

const Ctx = createContext<PageAdminCtx>({ role: null, staffRole: null })

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
