'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { UserX } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { assignRole, deactivateMember } from './actions'
import type { SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

export type MemberItem = {
  membershipId: string
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  role: CommunityRole
  circleName?: string
  joinedAt: string
  isCrewLead: boolean
  currentSeasonRank?: SeasonRank
  currentSeasonZaps?: number
}

const ROLES: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'admin', 'janitor']

const ROLE_LABEL: Record<CommunityRole, string> = {
  member:  'Member',
  crew:    'Crew',
  host:    'Host',
  guide:   'Guide',
  mentor:  'Mentor',
  admin:   'Admin',
  janitor: 'Janitor',
}

// `canManage` gates the role + deactivate controls. Those actions are janitor-only
// (assignRole / deactivateMember re-check the STAFF axis server-side); rendering them
// for a non-janitor community leader gave enabled controls that threw silently. The
// caller passes its own standing so we never show a dead control.
export function MemberManager({ members, canManage }: { members: MemberItem[]; canManage: boolean }) {
  const [search, setSearch] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = members.filter(
    (m) =>
      !search ||
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.handle.toLowerCase().includes(search.toLowerCase()),
  )

  function handleRoleChange(profileId: string, role: string) {
    setError(null)
    startTransition(async () => {
      try {
        await assignRole(profileId, role as CommunityRole)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update this member’s role.')
      }
    })
  }

  function handleDeactivate(profileId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await deactivateMember(profileId)
        setConfirmId(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not deactivate this member.')
      }
    })
  }

  const confirmTarget = confirmId ? members.find((m) => m.profileId === confirmId) : null

  return (
    <div>
      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or handle..."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-body-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/30 dark:border-border-strong dark:bg-surface-elevated dark:text-subtle/60 dark:placeholder:text-muted"
        />
      </div>

      {/* Action error — surfaced inline instead of failing silently */}
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-meta text-danger">
          {error}
        </p>
      )}

      {/* Confirm deactivation dialog */}
      {confirmId && confirmTarget && (
        <Dialog
          open
          onClose={() => setConfirmId(null)}
          ariaLabel={`Deactivate ${confirmTarget.displayName}?`}
          className="max-w-sm"
        >
          <div className="bg-surface rounded-2xl lift-3 border border-border p-6 w-full">
            <h3 className="text-body-sm font-semibold text-text mb-2">
              Deactivate {confirmTarget.displayName}?
            </h3>
            <p className="text-meta text-muted mb-5 leading-relaxed">
              This will mark the account as inactive. The member will lose access
              until reactivated by an admin.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-meta font-medium text-text hover:bg-surface-elevated transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isPending}
                onClick={() => handleDeactivate(confirmId)}
                className="rounded-lg bg-danger px-3 py-1.5 text-meta font-semibold text-on-danger hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Member list */}
      {filtered.length === 0 ? (
        <p className="text-body-sm text-subtle py-4 text-center">No members found.</p>
      ) : (
        <div className="space-y-0.5">
          {filtered.map((m) => {
            return (
              <div
                key={m.membershipId}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-elevated group -mx-3 transition-colors"
              >
                {/* Avatar */}
                {m.avatarUrl ? (
                  <Image
                    src={avatarSrc(m.avatarUrl)}
                    alt={m.displayName}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-pill object-cover shrink-0 mt-0.5"
                    style={avatarFocusStyle(m.avatarUrl)}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-pill bg-primary-bg text-primary-strong text-meta font-semibold flex items-center justify-center shrink-0 select-none mt-0.5">
                    {getInitials(m.displayName)}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/people/${m.handle}`}
                      className="text-body-sm font-medium text-text hover:underline"
                    >
                      {m.displayName}
                    </Link>
                    {m.isCrewLead && (
                      <span className="text-meta px-1.5 py-0.5 rounded-md bg-warning-bg dark:bg-warning-bg text-warning font-medium">
                        Crew Lead
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-meta text-subtle">
                    <span>@{m.handle}</span>
                    {m.circleName && (
                      <>
                        <span>·</span>
                        <span>{m.circleName}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>
                      {new Date(m.joinedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    {m.currentSeasonRank && m.currentSeasonRank !== 'ghost' && (
                      <>
                        <span>·</span>
                        <span className="capitalize text-primary-strong">{m.currentSeasonRank}</span>
                        {(m.currentSeasonZaps ?? 0) > 0 && (
                          <span className="text-primary">{m.currentSeasonZaps} Zaps</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Controls. Janitor-only (the actions are staff-gated), visible on hover */}
                {canManage && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {/* Named after the member the row belongs to: a bare "Role" would repeat once
                        per member and name none of them. */}
                    <Select
                      aria-label={`Role for ${m.displayName}`}
                      defaultValue={m.role}
                      disabled={isPending}
                      onChange={(e) => handleRoleChange(m.profileId, e.target.value)}
                      className="text-meta"
                      wrapperClassName="inline-block w-max max-w-full"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                    <button
                      onClick={() => setConfirmId(m.profileId)}
                      title="Deactivate member"
                      className="p-1.5 rounded-md text-subtle hover:text-danger hover:bg-danger-bg transition-colors"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
