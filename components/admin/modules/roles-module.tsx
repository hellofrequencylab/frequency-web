'use client'

import { useEffect, useState } from 'react'
import { RoleManager } from '@/app/(main)/admin/roles/role-manager'
import { StaffRoleManager } from '@/app/(main)/admin/roles/staff-role-manager'
import { PermissionGrid } from '@/app/(main)/admin/roles/permission-grid'
import { NAV_AREA_DEFAULTS } from '@/lib/nav-areas'
import { loadRoles } from '@/app/(main)/admin/roles/roles-action'

// In-place Roles (ADR-138 — People). Renders the existing role managers + permission
// grid inside the page admin console: assign community roles, operations roles, and
// nav-area access. Janitor-only via the loader (its actions re-check too). Fetches on
// mount.

type Data = NonNullable<Awaited<ReturnType<typeof loadRoles>>>

export function RolesModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadRoles().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="space-y-4">
      <RoleManager members={data.members} />
      <StaffRoleManager members={data.teamMembers} />
      <PermissionGrid initial={data.permissions} defaults={NAV_AREA_DEFAULTS} />
    </div>
  )
}
