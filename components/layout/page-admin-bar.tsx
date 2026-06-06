'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Shield, ChevronDown } from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { AdminConsole } from '@/components/admin/sidebar/admin-console'

// The on-page admin layer (IA restructure): a slim "Admin ▾" disclosure at the top of
// every operator-visible page that EXPANDS AN INLINE SECTION holding that page's admin
// functions — replacing the old right-edge drawer. Same page-aware console
// (`AdminConsole`, ADR-137/153), now hosted inline so admin lives *in* the page,
// condensed into one consistent, collapsible spot. Operators only; collapsed by
// default; auto-collapses on navigation.
export function PageAdminBar({
  role,
  staffRole,
}: {
  role: CommunityRole | null
  staffRole: StaffRole | null
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Collapse on route change (derived-state pattern).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  const isStaff = staffRole != null
  if (!(meetsAccess('host', role) || isStaff)) return null

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border bg-surface-elevated/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-text"
      >
        <Shield className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
        Admin
        <span className="font-normal text-subtle">· tools for this page</span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="flex max-h-[60vh] flex-col border-t border-border bg-surface">
          <AdminConsole role={role} staffRole={staffRole} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
