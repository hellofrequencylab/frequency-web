'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { UserX, Star } from 'lucide-react'
import { assignRole, deactivateMember, toggleSeasonComplete, assignLuminary } from './actions'
import type { SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'

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
  seasonChallengesComplete?: boolean
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

export function MemberManager({ members }: { members: MemberItem[] }) {
  const [search, setSearch] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = members.filter(
    (m) =>
      !search ||
      m.displayName.toLowerCase().includes(search.toLowerCase()) ||
      m.handle.toLowerCase().includes(search.toLowerCase()),
  )

  function handleRoleChange(profileId: string, role: string) {
    startTransition(async () => {
      await assignRole(profileId, role as CommunityRole)
    })
  }

  function handleDeactivate(profileId: string) {
    startTransition(async () => {
      await deactivateMember(profileId)
      setConfirmId(null)
    })
  }

  function handleToggleSeason(profileId: string, current: boolean) {
    startTransition(async () => {
      await toggleSeasonComplete(profileId, !current)
    })
  }

  function handleLuminary(profileId: string) {
    startTransition(async () => {
      await assignLuminary(profileId)
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
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-border-strong dark:bg-surface-elevated dark:text-subtle/60 dark:placeholder:text-muted"
        />
      </div>

      {/* Confirm deactivation dialog */}
      {confirmId && confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmId(null)}
        >
          <div
            className="bg-surface rounded-2xl shadow-xl border border-border p-6 max-w-sm mx-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-text mb-2">
              Deactivate {confirmTarget.displayName}?
            </h3>
            <p className="text-xs text-muted mb-5 leading-relaxed">
              This will mark the account as inactive. The member will lose access
              until reactivated by an admin.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-elevated transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isPending}
                onClick={() => handleDeactivate(confirmId)}
                className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-subtle py-4 text-center">No members found.</p>
      ) : (
        <div className="space-y-0.5">
          {filtered.map((m) => {
            const isConduit = m.currentSeasonRank === 'conduit'
            const isLuminary = m.currentSeasonRank === 'luminary'
            const canPromote = isConduit && m.seasonChallengesComplete && !isLuminary

            return (
              <div
                key={m.membershipId}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-elevated group -mx-3 transition-colors"
              >
                {/* Avatar */}
                {m.avatarUrl ? (
                  <Image
                    src={m.avatarUrl}
                    alt={m.displayName}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none mt-0.5">
                    {getInitials(m.displayName)}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/people/${m.handle}`}
                      className="text-sm font-medium text-text hover:underline"
                    >
                      {m.displayName}
                    </Link>
                    {m.isCrewLead && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-warning-bg dark:bg-warning-bg text-warning font-medium">
                        Crew Lead
                      </span>
                    )}
                    {isLuminary && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-warning-bg text-warning font-medium flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" /> Luminary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-subtle">
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
                          <span className="text-primary">{m.currentSeasonZaps} zaps</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Controls. Visible on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  {/* Season challenges toggle. Guides+ */}
                  {m.currentSeasonRank !== undefined && (
                    <button
                      onClick={() => handleToggleSeason(m.profileId, m.seasonChallengesComplete ?? false)}
                      disabled={isPending}
                      title={m.seasonChallengesComplete ? 'Mark season challenges incomplete' : 'Mark season challenges complete'}
                      className={`text-[11px] px-2 py-1 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                        m.seasonChallengesComplete
                          ? 'border-success bg-success-bg text-success dark:bg-success-bg/30 dark:text-success'
                          : 'border-border text-muted hover:border-success hover:text-success'
                      }`}
                    >
                      {m.seasonChallengesComplete ? '✓ Challenges' : 'Mark complete'}
                    </button>
                  )}
                  {/* Luminary promotion. Conduit + challenges complete */}
                  {canPromote && (
                    <button
                      onClick={() => handleLuminary(m.profileId)}
                      disabled={isPending}
                      title="Promote to Luminary"
                      className="text-[11px] px-2 py-1 rounded-lg border border-yellow-300 bg-warning-bg text-warning dark:text-primary font-medium hover:bg-warning-bg transition-colors disabled:opacity-50"
                    >
                      → Luminary
                    </button>
                  )}
                  <select
                    defaultValue={m.role}
                    disabled={isPending}
                    onChange={(e) => handleRoleChange(m.profileId, e.target.value)}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text focus:border-primary focus:outline-none cursor-pointer disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setConfirmId(m.profileId)}
                    title="Deactivate member"
                    className="p-1.5 rounded-md text-subtle hover:text-danger hover:bg-danger-bg transition-colors"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
