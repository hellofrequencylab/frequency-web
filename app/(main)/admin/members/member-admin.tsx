'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Search, ChevronDown, ChevronUp, Mail, Shield, Pencil,
  UserX, UserCheck, Trash2, Loader2, X, Check, Key,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import {
  assignRole, deactivateMember, reactivateMember,
  sendPasswordReset, updateMemberProfile, deleteUserAccount,
} from '../actions'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLES: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']

const ROLE_COLOR: Record<string, string> = {
  member:  'bg-gray-100 text-gray-600',
  crew:    'bg-blue-100 text-blue-700',
  host:    'bg-green-100 text-green-700',
  guide:   'bg-purple-100 text-purple-700',
  mentor:  'bg-amber-100 text-amber-700',
  janitor: 'bg-violet-100 text-violet-700',
}

interface Member {
  id: string
  auth_user_id: string | null
  display_name: string
  handle: string
  avatar_url: string | null
  bio: string | null
  community_role: string
  is_active: boolean
  created_at: string
  current_season_rank: string | null
  current_season_zaps: number | null
  regionName: string | null
}

export function MemberAdmin({
  members,
  emailMap,
}: {
  members: Member[]
  emailMap: Record<string, string>
}) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = members.filter(m => {
    if (!showInactive && !m.is_active) return false
    if (roleFilter !== 'all' && m.community_role !== roleFilter) return false
    if (query) {
      const q = query.toLowerCase()
      const email = emailMap[m.id]?.toLowerCase() ?? ''
      return m.display_name.toLowerCase().includes(q) ||
        m.handle.toLowerCase().includes(q) ||
        email.includes(q)
    }
    return true
  })

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, handle, or email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        >
          <option value="all">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show inactive
        </label>
      </div>

      {/* Member list */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No members found.</p>
        ) : (
          filtered.map(m => (
            <MemberRow
              key={m.id}
              member={m}
              email={emailMap[m.id] ?? null}
              isExpanded={expandedId === m.id}
              onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
            />
          ))
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">Showing {filtered.length} of {members.length} members</p>
    </div>
  )
}

function MemberRow({
  member: m,
  email,
  isExpanded,
  onToggle,
}: {
  member: Member
  email: string | null
  isExpanded: boolean
  onToggle: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [editMode, setEditMode] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const initials = getInitials(m.display_name)
  const roleCls = ROLE_COLOR[m.community_role] ?? ROLE_COLOR.member

  function handleRoleChange(role: string) {
    startTransition(async () => {
      await assignRole(m.id, role as CommunityRole)
      setStatus(`Role changed to ${role}`)
      setTimeout(() => setStatus(null), 2000)
    })
  }

  function handlePasswordReset() {
    startTransition(async () => {
      const result = await sendPasswordReset(m.id)
      setStatus(`Reset email sent to ${result.email}`)
      setTimeout(() => setStatus(null), 3000)
    })
  }

  function handleDeactivate() {
    startTransition(async () => {
      await deactivateMember(m.id)
      setStatus('Member deactivated')
      setTimeout(() => setStatus(null), 2000)
    })
  }

  function handleReactivate() {
    startTransition(async () => {
      await reactivateMember(m.id)
      setStatus('Member reactivated')
      setTimeout(() => setStatus(null), 2000)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteUserAccount(m.id)
      setStatus('Account deleted')
      setConfirmDelete(false)
    })
  }

  function handleProfileSave(fd: FormData) {
    startTransition(async () => {
      await updateMemberProfile(m.id, fd)
      setEditMode(false)
      setStatus('Profile updated')
      setTimeout(() => setStatus(null), 2000)
    })
  }

  return (
    <div className={`${!m.is_active ? 'opacity-50' : ''}`}>
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        {m.avatar_url ? (
          <img src={m.avatar_url} alt={m.display_name} className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-semibold flex items-center justify-center shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{m.display_name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleCls}`}>{m.community_role}</span>
            {!m.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Inactive</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">
            @{m.handle}
            {email && <> &middot; {email}</>}
          </p>
        </div>
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
        ) : isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50/50 dark:bg-gray-800/20">
          {status && (
            <div className="flex items-center gap-2 mb-3 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg">
              <Check className="w-3.5 h-3.5" /> {status}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Details</p>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <p>Joined {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                {m.regionName && <p>Region: {m.regionName}</p>}
                {m.current_season_rank && <p>Rank: {m.current_season_rank} ({m.current_season_zaps ?? 0} zaps)</p>}
                <p>
                  <Link href={`/people/${m.handle}`} className="text-indigo-500 hover:underline">View profile →</Link>
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Role</p>
              <select
                value={m.community_role}
                onChange={e => handleRoleChange(e.target.value)}
                disabled={isPending}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs disabled:opacity-50"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Edit profile form */}
          {editMode ? (
            <form action={handleProfileSave} className="space-y-3 mb-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Display name</label>
                <input name="display_name" defaultValue={m.display_name} className="w-full mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Handle</label>
                <input name="handle" defaultValue={m.handle} className="w-full mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Bio</label>
                <textarea name="bio" defaultValue={m.bio ?? ''} rows={2} className="w-full mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs resize-none" />
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={isPending} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                  Save changes
                </button>
                <button type="button" onClick={() => setEditMode(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Pencil className="w-3 h-3" /> Edit profile
            </button>
            <button
              onClick={handlePasswordReset}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <Key className="w-3 h-3" /> Send password reset
            </button>
            {m.is_active ? (
              <button
                onClick={handleDeactivate}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-orange-200 dark:border-orange-800 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors disabled:opacity-50"
              >
                <UserX className="w-3 h-3" /> Deactivate
              </button>
            ) : (
              <button
                onClick={handleReactivate}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-green-200 dark:border-green-800 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-50"
              >
                <UserCheck className="w-3 h-3" /> Reactivate
              </button>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete account
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
