'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, Trash2, UserMinus, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClasses } from '@/components/ui/field'
import { DemoBadge } from '@/components/ui/demo-badge'
import { getInitials } from '@/lib/utils'
import { isError } from '@/lib/action-result'
import {
  setMemberRole,
  removeMember,
  suspendMember,
  reactivateMember,
  bulkRosterOp,
} from '@/lib/spaces/roster-actions'
import type { SpaceRole, SpaceMemberStatus } from '@/lib/spaces/membership'
import { cn } from '@/lib/utils'

// ROSTER MANAGER (client) — the People module's roster table (Entity Management Overhaul EM2-2). The
// owner / admin manages who is on a Space here: per-member ROLE assignment along the per-Space ladder
// (Member / Editor / Moderator / Admin), REMOVE, SUSPEND / REACTIVATE, and the BULK ops (multi-select
// role change / remove / suspend / reactivate). Every mutation is a canManageMembers-gated server
// action (re-checked server-side, lib/spaces/roster.ts); this surface is convenience, not the gate.
//
// The Space OWNER row is shown for context but is never selectable or editable (the owner is
// all-powerful on their own Space and holds no member row; the server rejects acting on them too). A
// SUSPENDED member is dimmed and tagged, with Reactivate in place of Suspend. Plain labels, the
// space-role nouns, no em/en dashes (CONTENT-VOICE §10).

export interface RosterRow {
  profileId: string
  handle: string
  displayName: string
  avatarUrl: string | null
  isDemo: boolean
  /** The owner reports 'Owner'; a member reports their ladder role. */
  isOwner: boolean
  role: SpaceRole
  status: SpaceMemberStatus
}

// The assignable rungs, member-facing nouns (the ladder, lib/spaces/membership.ts). 'viewer' reads as
// the plain "Member".
const ROLE_OPTIONS: { value: SpaceRole; label: string }[] = [
  { value: 'viewer', label: 'Member' },
  { value: 'editor', label: 'Editor' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
]

const ROLE_LABEL: Record<SpaceRole, string> = {
  viewer: 'Member',
  editor: 'Editor',
  moderator: 'Moderator',
  admin: 'Admin',
}

function Avatar({ row }: { row: RosterRow }) {
  if (row.avatarUrl) {
    return (
      <Image
        src={row.avatarUrl}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
        aria-hidden
      />
    )
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong select-none"
      aria-hidden
    >
      {getInitials(row.displayName)}
    </span>
  )
}

export function RosterManager({
  spaceId,
  rows,
}: {
  spaceId: string
  rows: RosterRow[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRole, setBulkRole] = useState<SpaceRole>('editor')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The profile id currently mid-write (disables that row's controls); null when idle.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowPending, startRow] = useTransition()
  const [bulkPending, startBulk] = useTransition()

  // The members an owner / admin may select (everyone except the Space owner row).
  const selectableIds = useMemo(
    () => rows.filter((r) => !r.isOwner).map((r) => r.profileId),
    [rows],
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  function toggle(profileId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(profileId)) next.delete(profileId)
      else next.add(profileId)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  function reset(msg?: string) {
    setError(null)
    setNotice(msg ?? null)
    router.refresh()
  }

  function onRole(profileId: string, role: SpaceRole) {
    setError(null)
    setNotice(null)
    setBusyId(profileId)
    startRow(async () => {
      const result = await setMemberRole(spaceId, profileId, role)
      setBusyId(null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      reset('Role updated.')
    })
  }

  function onRowAction(
    profileId: string,
    action: typeof removeMember | typeof suspendMember | typeof reactivateMember,
    successMsg: string,
  ) {
    setError(null)
    setNotice(null)
    setBusyId(profileId)
    startRow(async () => {
      const result = await action(spaceId, profileId)
      setBusyId(null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(profileId)
        return next
      })
      reset(successMsg)
    })
  }

  function onBulk(op: Parameters<typeof bulkRosterOp>[2], label: string) {
    setError(null)
    setNotice(null)
    const ids = [...selected]
    if (ids.length === 0) {
      setError('Select at least one member first.')
      return
    }
    startBulk(async () => {
      const result = await bulkRosterOp(spaceId, ids, op)
      if (isError(result)) {
        setError(result.error)
        return
      }
      const { changed, skipped } = result.data
      setSelected(new Set())
      reset(
        skipped > 0
          ? `${label}: ${changed} updated, ${skipped} skipped.`
          : `${label}: ${changed} updated.`,
      )
    })
  }

  const anyPending = rowPending || bulkPending

  return (
    <div className="space-y-4">
      {/* Bulk action bar — appears once members are selected. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-elevated p-3 shadow-sm">
          <span className="text-sm font-medium text-text">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value as SpaceRole)}
              disabled={bulkPending}
              aria-label="Role to assign in bulk"
              className={cn(fieldClasses, 'w-auto py-1.5 text-xs')}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={bulkPending}
              onClick={() => onBulk({ kind: 'role', role: bulkRole }, 'Role change')}
            >
              Set role
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={bulkPending}
            onClick={() => onBulk({ kind: 'suspend' }, 'Suspend')}
          >
            <UserMinus className="h-3.5 w-3.5" aria-hidden /> Suspend
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={bulkPending}
            onClick={() => onBulk({ kind: 'reactivate' }, 'Reactivate')}
          >
            <UserCheck className="h-3.5 w-3.5" aria-hidden /> Reactivate
          </Button>
          <Button
            type="button"
            variant="dangerOutline"
            size="sm"
            disabled={bulkPending}
            onClick={() => onBulk({ kind: 'remove' }, 'Remove')}
          >
            {bulkPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}{' '}
            Remove
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="text-sm font-medium text-success" role="status">
          {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {/* Select-all header (only when there are selectable members). */}
        {selectableIds.length > 0 && (
          <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-xs font-medium text-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all members"
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span>Select all</span>
          </div>
        )}

        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const suspended = row.status === 'suspended'
            const rowBusy = busyId === row.profileId && rowPending
            return (
              <li
                key={row.profileId}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap',
                  suspended && 'opacity-60',
                )}
              >
                {row.isOwner ? (
                  <span className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <input
                    type="checkbox"
                    checked={selected.has(row.profileId)}
                    onChange={() => toggle(row.profileId)}
                    disabled={anyPending}
                    aria-label={`Select ${row.displayName}`}
                    className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                  />
                )}

                <Avatar row={row} />

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/people/${row.handle}`}
                    className="inline-flex items-center gap-1.5 truncate text-sm font-semibold text-text transition-colors hover:text-primary-strong"
                  >
                    {row.displayName}
                    {row.isDemo && <DemoBadge />}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    @{row.handle}
                    {suspended && <span className="ml-2 font-medium text-warning">Suspended</span>}
                  </p>
                </div>

                {/* The owner is shown read-only; members get the role select + actions. */}
                {row.isOwner ? (
                  <span className="shrink-0 text-sm font-medium text-primary-strong">Owner</span>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      value={row.role}
                      onChange={(e) => onRole(row.profileId, e.target.value as SpaceRole)}
                      disabled={anyPending || suspended}
                      aria-label={`Role for ${row.displayName}`}
                      title={suspended ? 'Reactivate to change the role' : undefined}
                      className={cn(fieldClasses, 'w-auto py-1.5 text-xs')}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {suspended ? (
                      <button
                        type="button"
                        onClick={() =>
                          onRowAction(row.profileId, reactivateMember, 'Member reactivated.')
                        }
                        disabled={anyPending}
                        aria-label={`Reactivate ${row.displayName}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-success/40 hover:text-success disabled:opacity-40"
                      >
                        <UserCheck className="h-4 w-4" aria-hidden />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onRowAction(row.profileId, suspendMember, 'Member suspended.')
                        }
                        disabled={anyPending}
                        aria-label={`Suspend ${row.displayName}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-warning/40 hover:text-warning disabled:opacity-40"
                      >
                        <UserMinus className="h-4 w-4" aria-hidden />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onRowAction(row.profileId, removeMember, 'Member removed.')}
                      disabled={anyPending}
                      aria-label={`Remove ${row.displayName}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                    >
                      {rowBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <p className="text-xs text-subtle">
        Roles climb a ladder: Member, Editor, Moderator, Admin. Editors can shape the space, Moderators
        can invite, Admins can manage the team. Suspending a member keeps their history but pauses their
        access until you reactivate them. {ROLE_LABEL.admin}s and the Owner manage members.
      </p>
    </div>
  )
}
