'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, Mail, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { createInvite, revokeInvite } from '@/lib/spaces/invites-actions'
// The type + the pure accept-link helper come from the client-safe shared module, NOT from
// lib/spaces/invites.ts: that module imports the server-only IO graph (@/lib/auth -> view-as ->
// supabase/server), which would fail this client component's bundle.
import { inviteAcceptUrl, type SpaceInvite } from '@/lib/spaces/invites-shared'
import type { SpaceRole } from '@/lib/spaces/membership'
import { cn } from '@/lib/utils'

// INVITE A TEAMMATE (client). The owner (or admin) of a Space invites a teammate by email at a role,
// through the canManageMembers-gated createInvite action. The server is authoritative: it validates
// the email + role and refreshes a live invite for the same email, so this form is convenience, not
// the gate. Below the form, the current pending invites list with a copyable accept link + a revoke.
//
// The form emails the invite (the accept link) and ALSO surfaces the link to copy + share by hand.
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
        className={cn(fieldClasses, 'min-w-0 flex-1 font-mono text-xs')}
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
      const { invite } = result.data
      // Replace any existing pending invite for the same email (the server refreshes it in place),
      // then prepend the new one.
      setInvites((prev) => [
        invite,
        ...prev.filter((i) => i.email.toLowerCase() !== invite.email.toLowerCase()),
      ])
      setEmail('')
      setJustInvited(invite.email)
      router.refresh()
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
      <form
        className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending) send()
        }}
      >
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
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as SpaceRole)}
              className={cn(fieldClasses, 'mt-1')}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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

        <p className="text-xs text-subtle">
          We email your teammate the invite with a link to join. You can also copy the link below and
          share it yourself. When they open it while signed in, they join your team at the role you
          picked.
        </p>

        {error && (
          <p
            className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
        {justInvited && !error && (
          <p
            className="inline-flex items-center gap-1 text-sm font-medium text-success"
            role="status"
          >
            <Check className="h-4 w-4" aria-hidden /> Invite sent to {justInvited}. You can also copy
            its link below.
          </p>
        )}
      </form>

      <div>
        <h3 className="mb-3 text-sm font-bold tracking-tight text-text">
          Pending invites
          {invites.length > 0 && (
            <span className="ml-2 text-xs font-medium tabular-nums text-subtle">
              {invites.length}
            </span>
          )}
        </h3>

        {invites.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
            No invites waiting. Invite a teammate above to add them to your team.
          </p>
        ) : (
          <ul className="space-y-3">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">{invite.email}</p>
                    <p className="text-xs text-muted">
                      Invited as {ROLE_LABEL[invite.role]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(invite.id)}
                    disabled={revoking}
                    aria-label={`Revoke the invite for ${invite.email}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
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
