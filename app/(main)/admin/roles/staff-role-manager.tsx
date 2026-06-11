'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { Briefcase, UserPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setStaffRole, addStaffMember } from './actions'
import {
  STAFF_ROLES, STAFF_ROLE_LABEL, STAFF_ROLE_BLURB, type StaffRole,
} from '@/lib/core/staff-roles'
import { getInitials } from '@/lib/utils'

export type StaffMemberRow = {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  role: StaffRole
}

// The operations/team role assignment (ADR-127, team_members axis) — a janitor-only
// panel on /admin/roles. Lists current team members with an editable role + remove,
// and an add-by-handle row. Separate from the community trust ladder above.
export function StaffRoleManager({ members }: { members: StaffMemberRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Add row
  const [handle, setHandle] = useState('')
  const [addRole, setAddRole] = useState<StaffRole>('operations')
  const [adding, setAdding] = useState(false)

  function changeRole(profileId: string, role: StaffRole) {
    setError(null)
    setBusyId(profileId)
    startTransition(async () => {
      try {
        await setStaffRole(profileId, role)
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update role.')
        setBusyId(null)
      }
    })
  }

  function remove(profileId: string) {
    setError(null)
    setBusyId(profileId)
    startTransition(async () => {
      try {
        await setStaffRole(profileId, null)
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove.')
        setBusyId(null)
      }
    })
  }

  function add() {
    if (!handle.trim() || adding) return
    setError(null)
    setAdding(true)
    startTransition(async () => {
      const res = await addStaffMember(handle, addRole)
      if (res.ok) {
        window.location.reload()
      } else {
        setError(res.error ?? 'Could not add member.')
        setAdding(false)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Briefcase className="h-4 w-4 text-primary-strong" />
          Team &amp; operations roles
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          The business/operations axis (separate from community standing). Owner &amp; Admin span;
          Operations, Marketing, Accounting &amp; Support are departments; Analyst is read-only.
        </p>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-lg border border-danger bg-danger-bg/30 px-3 py-2 text-xs text-danger">{error}</p>
      )}

      {/* Add a member */}
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder="member-handle"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-7 pr-3 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/30"
          />
        </div>
        <select
          value={addRole}
          onChange={(e) => setAddRole(e.target.value as StaffRole)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none"
        >
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>
          ))}
        </select>
        <Button
          type="button"
          onClick={add}
          disabled={!handle.trim() || adding}
          className="shrink-0 shadow-sm"
        >
          <UserPlus className="h-4 w-4" />
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {/* Current team */}
      {members.length === 0 ? (
        <p className="p-4 text-sm text-subtle">No team members yet. Add one above.</p>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.profileId} className="flex items-center gap-3 p-3">
              {m.avatarUrl ? (
                <Image src={m.avatarUrl} alt={m.displayName} width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-xs font-semibold text-primary-strong">
                  {getInitials(m.displayName)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{m.displayName}</p>
                <p className="truncate text-xs text-subtle">@{m.handle} · {STAFF_ROLE_BLURB[m.role]}</p>
              </div>
              <select
                value={m.role}
                disabled={busyId === m.profileId}
                onChange={(e) => changeRole(m.profileId, e.target.value as StaffRole)}
                className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none disabled:opacity-50"
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(m.profileId)}
                disabled={busyId === m.profileId}
                aria-label={`Remove ${m.displayName} from the team`}
                className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
