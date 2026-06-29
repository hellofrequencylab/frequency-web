'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Search, ChevronDown, ChevronUp, Mail, Pencil,
  UserX, UserCheck, Trash2, Loader2, Check, Sparkles,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  assignRole, deactivateMember, reactivateMember,
  sendMagicLink, updateMemberProfile, deleteUserAccount,
} from '../actions'
import { EconomyPanel } from './economy-panel'
import { toggleSpotlightEnabled, resetSpotlightToDefault, forceUnpublishSpotlight } from './spotlight-actions'

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
  is_active: boolean | null
  /** The system voice (Vera, ADR-231): no sign-in, can't be deleted, chip reads Moderator. */
  is_system?: boolean
  created_at: string | null
  current_season_rank: string | null
  current_season_zaps: number | null
  regionName: string | null
  /** Derived from meta server-side — is this member's Spotlight page turned on?
   *  The raw meta blob is never sent to the client (it holds PII). */
  spotlightEnabled: boolean
}

export function MemberAdmin({
  members,
  emailMap,
}: {
  members: Member[]
  emailMap: Record<string, string>
}) {
  // Deep-link support: a profile's "Manage account" link lands here as
  // ?q=<handle>&member=<id> — pre-filter the roster to that member and open their row.
  const sp = useSearchParams()
  const [query, setQuery] = useState(sp.get('q') ?? '')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(sp.get('member'))

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
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30"
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
  const [spotlightOn, setSpotlightOn] = useState(m.spotlightEnabled)

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
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
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
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
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

  function handleToggleSpotlight() {
    const next = !spotlightOn
    startTransition(async () => {
      try {
        await toggleSpotlightEnabled(m.id, next)
        setSpotlightOn(next)
        setStatus(next ? 'Spotlight turned on for this member' : 'Spotlight turned off')
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
      setTimeout(() => setStatus(null), 2500)
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
          <Image src={m.avatar_url} alt={m.display_name} width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-surface-elevated text-muted text-xs font-semibold flex items-center justify-center shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text truncate">{m.display_name}</span>
            <RoleBadge role={m.is_system ? 'moderator' : m.community_role} className="text-xs leading-tight" />
            {m.is_system && <span className="text-xs px-1.5 py-0.5 rounded-md font-medium bg-primary-bg text-primary-strong">System</span>}
            {!m.is_active && <span className="text-xs px-1.5 py-0.5 rounded-md font-medium bg-danger-bg text-danger">Inactive</span>}
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
              <p className="text-sm font-bold text-text mb-1">Details</p>
              <div className="text-xs text-muted space-y-1">
                {m.created_at && <p>Joined {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                {m.regionName && <p>Region: {m.regionName}</p>}
                {m.current_season_rank && <p>Rank: {m.current_season_rank} ({m.current_season_zaps ?? 0} zaps)</p>}
                <p>
                  <Link href={`/people/${m.handle}`} className="text-primary-strong hover:underline">View profile →</Link>
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-text mb-1">Role</p>
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
                <label className="text-sm font-bold text-text">Display name</label>
                <input name="display_name" defaultValue={m.display_name} className="w-full mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-sm font-bold text-text">Handle</label>
                <input name="handle" defaultValue={m.handle} className="w-full mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-sm font-bold text-text">Bio</label>
                <textarea name="bio" defaultValue={m.bio ?? ''} rows={2} className="w-full mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs resize-none" />
              </div>
              <div>
                <label className="text-sm font-bold text-text">Avatar URL</label>
                <input name="avatar_url" type="url" defaultValue={m.avatar_url ?? ''} placeholder="https://…" className="w-full mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={isPending}>
                  Save changes
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {/* Economy: gem / zap grant + revoke */}
          <div className="mb-4">
            <EconomyPanel profileId={m.id} displayName={m.display_name} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditMode(!editMode)}
            >
              <Pencil className="w-3 h-3" /> Edit profile
            </Button>
            {/* Spotlight page (opt-in public mini-site) — off for everyone by
                default, flipped on here per member to let them set theirs up. */}
            {!m.is_system && (
              <Button
                variant={spotlightOn ? 'successOutline' : 'secondary'}
                size="sm"
                onClick={handleToggleSpotlight}
                disabled={isPending}
              >
                <Sparkles className="w-3 h-3" />
                {spotlightOn ? 'Spotlight on' : 'Turn on Spotlight'}
              </Button>
            )}
            {!m.is_system && spotlightOn && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    try { await forceUnpublishSpotlight(m.id); setStatus('Spotlight unpublished') }
                    catch (err) { setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`) }
                    setTimeout(() => setStatus(null), 2500)
                  })}
                >
                  Unpublish Spotlight
                </Button>
                <Button
                  variant="warningOutline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    try { await resetSpotlightToDefault(m.id); setStatus('Spotlight reset to default') }
                    catch (err) { setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`) }
                    setTimeout(() => setStatus(null), 2500)
                  })}
                >
                  Reset Spotlight
                </Button>
              </>
            )}
            {/* No sign-in link or delete for the system voice: she has no auth user,
                and deleteUserAccount guards her server-side anyway (ADR-231). */}
            {!m.is_system && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSendMagicLink}
                disabled={isPending}
              >
                <Mail className="w-3 h-3" /> Send sign-in link
              </Button>
            )}
            {m.is_active ? (
              <Button variant="warningOutline" size="sm" onClick={handleDeactivate} disabled={isPending}>
                <UserX className="w-3 h-3" /> Deactivate
              </Button>
            ) : (
              <Button variant="successOutline" size="sm" onClick={handleReactivate} disabled={isPending}>
                <UserCheck className="w-3 h-3" /> Reactivate
              </Button>
            )}
            {m.is_system ? null : !confirmDelete ? (
              <Button variant="dangerOutline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3 h-3" /> Delete account
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-danger font-medium">Are you sure?</span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isPending}
                >
                  Yes, delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
