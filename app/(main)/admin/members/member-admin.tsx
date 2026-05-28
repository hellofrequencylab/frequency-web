'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Search, ChevronDown, ChevronUp, Mail, Pencil,
  UserX, UserCheck, Trash2, Loader2, Check,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import {
  assignRole, deactivateMember, reactivateMember,
  sendMagicLink, updateMemberProfile, deleteUserAccount,
} from '../actions'

import { type CommunityRole, RoleBadge } from '@/lib/community-roles'

const ROLES: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'janitor']

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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, handle, or email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="all">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-border-strong"
          />
          Show inactive
        </label>
      </div>

      {/* Member list */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="text-sm text-subtle text-center py-8">No members found.</p>
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

      <p className="text-xs text-subtle mt-3">Showing {filtered.length} of {members.length} members</p>
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

  function handleRoleChange(role: string) {
    startTransition(async () => {
      await assignRole(m.id, role as CommunityRole)
      setStatus(`Role changed to ${role}`)
      setTimeout(() => setStatus(null), 2000)
    })
  }

  function handleSendMagicLink() {
    startTransition(async () => {
      try {
        const result = await sendMagicLink(m.id)
        setStatus(`Sign-in link sent to ${result.email}`)
      } catch (err: any) {
        setStatus(`Error: ${err.message}`)
      }
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
      try {
        await deleteUserAccount(m.id)
        setStatus('Account deleted')
        setConfirmDelete(false)
      } catch (err: any) {
        setStatus(`Error: ${err.message}`)
        setTimeout(() => setStatus(null), 6000)
      }
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
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors text-left"
      >
        {m.avatar_url ? (
          <img src={m.avatar_url} alt={m.display_name} className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-surface-elevated text-muted text-xs font-semibold flex items-center justify-center shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text truncate">{m.display_name}</span>
            <RoleBadge role={m.community_role as CommunityRole} className="text-[10px] leading-tight" />
            {!m.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-danger-bg text-danger">Inactive</span>}
          </div>
          <p className="text-xs text-subtle truncate">
            @{m.handle}
            {email && <> &middot; {email}</>}
          </p>
        </div>
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin text-subtle shrink-0" />
        ) : isExpanded ? (
          <ChevronUp className="w-4 h-4 text-subtle shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-subtle shrink-0" />
        )}
      </button>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 bg-surface/50 dark:bg-surface-elevated/20">
          {status && (
            <div className="flex items-center gap-2 mb-3 text-xs font-medium text-success bg-success-bg/30 px-3 py-2 rounded-lg">
              <Check className="w-3.5 h-3.5" /> {status}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1">Details</p>
              <div className="text-xs text-muted space-y-1">
                <p>Joined {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                {m.regionName && <p>Region: {m.regionName}</p>}
                {m.current_season_rank && <p>Rank: {m.current_season_rank} ({m.current_season_zaps ?? 0} zaps)</p>}
                <p>
                  <Link href={`/people/${m.handle}`} className="text-primary-strong hover:underline">View profile →</Link>
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1">Role</p>
              <select
                value={m.community_role}
                onChange={e => handleRoleChange(e.target.value)}
                disabled={isPending}
                className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs disabled:opacity-50"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Edit profile form */}
          {editMode ? (
            <form action={handleProfileSave} className="space-y-3 mb-4 rounded-xl border border-border p-3 bg-surface">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Display name</label>
                <input name="display_name" defaultValue={m.display_name} className="w-full mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Handle</label>
                <input name="handle" defaultValue={m.handle} className="w-full mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Bio</label>
                <textarea name="bio" defaultValue={m.bio ?? ''} rows={2} className="w-full mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs resize-none" />
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary disabled:opacity-50">
                  Save changes
                </button>
                <button type="button" onClick={() => setEditMode(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated">
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setEditMode(!editMode)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors"
            >
              <Pencil className="w-3 h-3" /> Edit profile
            </button>
            <button
              onClick={handleSendMagicLink}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              <Mail className="w-3 h-3" /> Send sign-in link
            </button>
            {m.is_active ? (
              <button
                onClick={handleDeactivate}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning-bg transition-colors disabled:opacity-50"
              >
                <UserX className="w-3 h-3" /> Deactivate
              </button>
            ) : (
              <button
                onClick={handleReactivate}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-success px-3 py-1.5 text-xs font-medium text-success hover:bg-success-bg dark:hover:bg-success-bg/30 transition-colors disabled:opacity-50"
              >
                <UserCheck className="w-3 h-3" /> Reactivate
              </button>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-bg transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete account
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-danger font-medium">Are you sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger disabled:opacity-50"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-elevated"
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
