'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, Check, Copy, Loader2, Mail, Search, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Input, Label, fieldClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import {
  createInvite,
  inviteByProfile,
  revokeInvite,
  searchTeamCandidates,
} from '@/lib/spaces/invites-actions'
// The types + the pure accept-link helper come from the client-safe shared module, NOT from
// lib/spaces/invites.ts: that module imports the server-only IO graph (@/lib/auth -> view-as ->
// supabase/server), which would fail this client component's bundle.
import {
  inviteAcceptUrl,
  type SpaceInvite,
  type TeamCandidate,
} from '@/lib/spaces/invites-shared'
import type { SpaceRole } from '@/lib/spaces/membership'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/ui/icon-button'

// INVITE A TEAMMATE (client). The owner (or admin) of a Space adds a teammate at a role, through the
// canManageMembers-gated actions. The server is authoritative: it validates the address + role,
// re-checks the seat allowance and refreshes a live invite for the same person, so these forms are
// convenience, not the gate. Below them, the pending invites with a copyable accept link + a revoke.
//
// TWO PATHS, NOT A MODE TOGGLE. Searching a handle and typing an address are not two ways to do the
// same thing, they answer two different questions: "which of these members do I mean" and "how do I
// reach someone who has no account yet". A segmented control would hide whichever one the owner
// needs behind a click and force them to know which mode they were in; the sections below just say
// what each is for. Handle search leads because on a product where the person already has a profile,
// asking the owner for an address the UI never shows them is the harder path.
//
// The email itself never reaches this component. The picker gets public identity only and posts back
// a profile id; the server resolves the address (see lib/spaces/invites.ts §Invite by @handle).
//
// Plain labels, the space-role nouns, no em/en dashes.

// The roles an owner may invite at, shown as the member-facing nouns (the ladder, lib/spaces/
// membership.ts). 'viewer' reads as the plain "Member".
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

/** A copyable accept link with a one-tap "Copy" affordance (falls back to selecting the text). */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: leave the link visible to copy by hand.
      setCopied(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(fieldClasses, 'min-w-0 flex-1 font-mono text-meta')}
        aria-label="Invite link"
      />
      <Button type="button" variant="secondary" size="sm" onClick={copy} className="shrink-0">
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
          </>
        )}
      </Button>
    </div>
  )
}

/** Search members by name or @handle and invite the one you meant, at a role.
 *
 *  `onInvited` hands the created invite up so the pending list below stays in step with both
 *  paths. The server refreshes an existing pending invite in place rather than piling up a
 *  second one, so the parent replaces by email rather than prepending blindly. */
function TeamPicker({
  spaceId,
  onInvited,
}: {
  spaceId: string
  onInvited: (invite: SpaceInvite, who: string) => void
}) {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<SpaceRole>('editor')
  const [hits, setHits] = useState<TeamCandidate[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitingId, setInvitingId] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Every search is a round trip, so a slow one can land after a faster later one and overwrite
  // fresher results with staler ones. The sequence number is what makes the LAST query typed win
  // rather than the last response received.
  const seq = useRef(0)

  function onQuery(value: string) {
    setQ(value)
    setError(null)
    if (debounce.current) clearTimeout(debounce.current)
    // The server floor is 2 characters after the @ is stripped, so mirror it here: a shorter term
    // would always come back empty and "no members match" would be a lie about the search.
    if (value.trim().replace(/^@/, '').length < 2) {
      setHits([])
      setSearched(false)
      return
    }
    debounce.current = setTimeout(() => {
      const mine = ++seq.current
      searchTeamCandidates(spaceId, value).then((r) => {
        if (mine !== seq.current) return
        setHits(r)
        setSearched(true)
      })
    }, 250)
  }

  function invite(person: TeamCandidate) {
    const who = person.displayName ?? (person.handle ? `@${person.handle}` : 'that member')
    setError(null)
    setInvitingId(person.id)
    start(async () => {
      const result = await inviteByProfile(spaceId, person.id, role)
      setInvitingId(null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      // Drop the person from the results: they are on the team's invite list now, and the next
      // search would exclude them anyway.
      setHits((prev) => prev.filter((h) => h.id !== person.id))
      onInvited(result.data.invite, who)
    })
  }

  return (
    <section className="space-y-4 rounded-card border border-border bg-surface p-5 lift-1">
      <div>
        <h3 className="flex items-center gap-1.5 text-body-sm font-bold tracking-tight text-text">
          <AtSign className="h-4 w-4 text-primary-strong" aria-hidden /> Find a teammate
        </h3>
        <p className="mt-1 text-meta text-muted">
          Search anyone on Frequency by name or @handle. They join at the role you pick as soon as
          they open their invite.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="invite-search" className="font-semibold">
            Name or handle
          </Label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              id="invite-search"
              type="search"
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="@handle or name"
              autoComplete="off"
              className="pl-9"
            />
          </div>
        </div>
        <div className="sm:w-44">
          <Label htmlFor="invite-search-role" className="font-semibold">
            Role
          </Label>
          <Select
            id="invite-search-role"
            value={role}
            onChange={(e) => setRole(e.target.value as SpaceRole)}
            options={ROLE_OPTIONS}
            wrapperClassName="mt-1"
          />
        </div>
      </div>

      {error && (
        <p
          className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Results arrive without any focus change, so a screen reader would otherwise never learn
          they exist. The region is always mounted (an aria-live element added at the same time as
          its text is not reliably announced). */}
      <p className="sr-only" role="status" aria-live="polite">
        {searched
          ? hits.length === 1
            ? '1 member matches.'
            : `${hits.length} members match.`
          : ''}
      </p>

      {hits.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
          {hits.map((person) => {
            const name = person.displayName ?? 'Member'
            return (
              <li key={person.id} className="flex items-center gap-3 bg-surface p-3">
                <Avatar src={person.avatarUrl} name={name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium text-text">{name}</p>
                  {person.handle && (
                    <p className="truncate text-meta text-subtle">@{person.handle}</p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => invite(person)}
                  disabled={pending}
                  aria-label={`Invite ${name} as ${ROLE_LABEL[role]}`}
                  className="shrink-0"
                >
                  {invitingId === person.id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Inviting
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" aria-hidden /> Invite
                    </>
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {searched && hits.length === 0 && (
        <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-body-sm text-muted">
          No members match that search, and anyone already on your team is left out of it. If they
          are not on Frequency yet, invite them by email below.
        </p>
      )}
    </section>
  )
}

export function InviteForm({
  spaceId,
  initialInvites,
}: {
  spaceId: string
  initialInvites: SpaceInvite[]
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<SpaceRole>('editor')
  const [invites, setInvites] = useState<SpaceInvite[]>(initialInvites)
  const [error, setError] = useState<string | null>(null)
  const [justInvited, setJustInvited] = useState<string | null>(null)
  const [pending, startInvite] = useTransition()
  const [revoking, startRevoke] = useTransition()

  /** Fold a created invite into the pending list, from either path. The server refreshes a live
   *  invite for the same address in place rather than adding a second, so replace by email. */
  function recordInvite(invite: SpaceInvite, who: string) {
    setError(null)
    setInvites((prev) => [
      invite,
      ...prev.filter((i) => i.email.toLowerCase() !== invite.email.toLowerCase()),
    ])
    setJustInvited(who)
    router.refresh()
  }

  function send() {
    setError(null)
    setJustInvited(null)
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Enter the teammate email you want to invite.')
      return
    }

    startInvite(async () => {
      const result = await createInvite(spaceId, trimmed, role)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setEmail('')
      recordInvite(result.data.invite, result.data.invite.email)
    })
  }

  function revoke(inviteId: string) {
    setError(null)
    startRevoke(async () => {
      const result = await revokeInvite(inviteId)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <TeamPicker spaceId={spaceId} onInvited={recordInvite} />

      <form
        className="space-y-4 rounded-card border border-border bg-surface p-5 lift-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending) send()
        }}
      >
        <div>
          <h3 className="flex items-center gap-1.5 text-body-sm font-bold tracking-tight text-text">
            <Mail className="h-4 w-4 text-primary-strong" aria-hidden /> Invite by email
          </h3>
          <p className="mt-1 text-meta text-muted">
            For someone who is not on Frequency yet. They sign in with that address, and the invite
            brings them straight to your team.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="invite-email" className="font-semibold">
              Email
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              autoComplete="off"
              maxLength={254}
              className="mt-1"
            />
          </div>
          <div className="sm:w-44">
            <Label htmlFor="invite-role" className="font-semibold">
              Role
            </Label>
            <Select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as SpaceRole)}
              options={ROLE_OPTIONS}
              wrapperClassName="mt-1"
            />
          </div>
          <Button type="submit" disabled={pending} className="shrink-0">
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Inviting
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" aria-hidden /> Send invite
              </>
            )}
          </Button>
        </div>

        <p className="text-meta text-subtle">
          We email your teammate the invite with a link to join. You can also copy the link below and
          share it yourself. When they open it while signed in, they join your team at the role you
          picked.
        </p>

        {error && (
          <p
            className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
        {justInvited && !error && (
          <p
            className="inline-flex items-center gap-1 text-body-sm font-medium text-success"
            role="status"
          >
            <Check className="h-4 w-4" aria-hidden /> Invite sent to {justInvited}. You can also copy
            its link below.
          </p>
        )}
      </form>

      <div>
        <h3 className="mb-3 text-body-sm font-bold tracking-tight text-text">
          Pending invites
          {invites.length > 0 && (
            <span className="ml-2 text-meta font-medium tabular-nums text-subtle">
              {invites.length}
            </span>
          )}
        </h3>

        {invites.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-body-sm text-muted">
            No invites waiting. Invite a teammate above to add them to your team.
          </p>
        ) : (
          <ul className="space-y-3">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="space-y-3 rounded-card border border-border bg-surface p-4 lift-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">{invite.email}</p>
                    <p className="text-meta text-muted">
                      Invited as {ROLE_LABEL[invite.role]}
                    </p>
                  </div>
                  <IconButton
                    variant="bordered"
                    tone="danger"
                    label={`Revoke the invite for ${invite.email}`}
                    onClick={() => revoke(invite.id)}
                    disabled={revoking}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </IconButton>
                </div>
                <CopyLink url={inviteAcceptUrl(invite.token)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
