'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { UserX, Star } from 'lucide-react'
import { assignRole, deactivateMember, toggleSeasonComplete, assignLuminary } from './actions'
import type { SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

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

const ROLES: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']

const ROLE_LABEL: Record<CommunityRole, string> = {
  member:  'Member',
  crew:    'Crew',
  host:    'Host',
  guide:   'Guide',
  mentor:  'Mentor',
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
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
      </div>

      {/* Confirm deactivation dialog */}
      {confirmId && confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setConfirmId(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-800/60 p-6 max-w-sm mx-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
              Deactivate {confirmTarget.displayName}?
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              This will mark the account as inactive. The member will lose access
              until reactivated by an admin.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isPending}
                onClick={() => handleDeactivate(confirmId)}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No members found.</p>
      ) : (
        <div className="space-y-0.5">
          {filtered.map((m) => {
            const isConduit = m.currentSeasonRank === 'conduit'
            const isLuminary = m.currentSeasonRank === 'luminary'
            const canPromote = isConduit && m.seasonChallengesComplete && !isLuminary

            return (
              <div
                key={m.membershipId}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 group -mx-3 transition-colors"
              >
                {/* Avatar */}
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt={m.displayName}
                    className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center justify-center shrink-0 select-none mt-0.5">
                    {getInitials(m.displayName)}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/people/${m.handle}`}
                      className="text-sm font-medium text-gray-900 dark:text-gray-50 hover:underline"
                    >
                      {m.displayName}
                    </Link>
                    {m.isCrewLead && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium">
                        Crew Lead
                      </span>
                    )}
                    {isLuminary && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 font-medium flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" /> Luminary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
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
                        <span className="capitalize text-indigo-500 dark:text-indigo-400">{m.currentSeasonRank}</span>
                        {(m.currentSeasonZaps ?? 0) > 0 && (
                          <span className="text-amber-500">{m.currentSeasonZaps} zaps</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Controls — visible on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  {/* Season challenges toggle — guides+ */}
                  {m.currentSeasonRank !== undefined && (
                    <button
                      onClick={() => handleToggleSeason(m.profileId, m.seasonChallengesComplete ?? false)}
                      disabled={isPending}
                      title={m.seasonChallengesComplete ? 'Mark season challenges incomplete' : 'Mark season challenges complete'}
                      className={`text-[11px] px-2 py-1 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                        m.seasonChallengesComplete
                          ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-green-300 hover:text-green-600'
                      }`}
                    >
                      {m.seasonChallengesComplete ? '✓ Challenges' : 'Mark complete'}
                    </button>
                  )}
                  {/* Luminary promotion — conduit + challenges complete */}
                  {canPromote && (
                    <button
                      onClick={() => handleLuminary(m.profileId)}
                      disabled={isPending}
                      title="Promote to Luminary"
                      className="text-[11px] px-2 py-1 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400 font-medium hover:bg-yellow-100 dark:hover:bg-yellow-950/50 transition-colors disabled:opacity-50"
                    >
                      → Luminary
                    </button>
                  )}
                  <select
                    defaultValue={m.role}
                    disabled={isPending}
                    onChange={(e) => handleRoleChange(m.profileId, e.target.value)}
                    className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 focus:border-indigo-300 focus:outline-none cursor-pointer disabled:opacity-50"
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
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
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
