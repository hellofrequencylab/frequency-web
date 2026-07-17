'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Lock, Users } from 'lucide-react'
import { setVisibility } from '@/app/(main)/connections/actions'
import type { Visibility } from '@/lib/connections/types'

// The owner-only visibility control for one capture (ADR-132/154/778). Up to three tiers:
//   • Private — only you.
//   • Network — same-city stewards can find the basic card (the cross-steward tier, ADR-132).
//   • Shared  — the team of a Space YOU operate can see the card. Offered ONLY when you operate at
//               least one Space; the picker lists those Spaces. Server-verified on save, so a member
//               who operates no Space can never reach it.
// Helper text stays honest: your email, phone, notes, and tags stay private in every case except
// that a Shared card's contact fields are visible to your Space's team (never your notes or tags).

/** A Space the owner operates, minimal shape for the picker. */
export interface OperatedSpaceOption {
  id: string
  name: string
}

export function VisibilityControl({
  contactId,
  initial,
  initialSharedSpaceId,
  city,
  operatedSpaces = [],
}: {
  contactId: string
  initial: Visibility
  initialSharedSpaceId?: string | null
  city: string | null
  /** The Spaces the owner operates; when empty, the Shared tier is not offered at all. */
  operatedSpaces?: OperatedSpaceOption[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const canShare = operatedSpaces.length > 0

  // Fall back off 'shared' if it isn't actually offered (no operated Space, or a stale scope).
  const validInitialShare =
    initial === 'shared' && canShare && operatedSpaces.some((s) => s.id === initialSharedSpaceId)
  const [visibility, setVis] = useState<Visibility>(validInitialShare ? 'shared' : initial === 'network' ? 'network' : 'private')
  const [spaceId, setSpaceId] = useState<string>(
    validInitialShare && initialSharedSpaceId ? initialSharedSpaceId : operatedSpaces[0]?.id ?? '',
  )

  function apply(next: Visibility, nextSpaceId: string) {
    setVis(next)
    if (next === 'shared') setSpaceId(nextSpaceId)
    start(async () => {
      await setVisibility(contactId, next, next === 'shared' ? nextSpaceId : null)
      router.refresh()
    })
  }

  const where = city ? `stewards in ${city}` : 'stewards in the same city'
  const sharedSpaceName = operatedSpaces.find((s) => s.id === spaceId)?.name ?? 'your Space'

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Who can see this contact" className="flex flex-wrap gap-1.5">
        <Choice
          active={visibility === 'private'}
          disabled={pending}
          onClick={() => apply('private', spaceId)}
          icon={<Lock className="h-4 w-4" aria-hidden />}
          label="Private"
        />
        <Choice
          active={visibility === 'network'}
          disabled={pending}
          onClick={() => apply('network', spaceId)}
          icon={<Globe className="h-4 w-4" aria-hidden />}
          label="Network"
        />
        {canShare && (
          <Choice
            active={visibility === 'shared'}
            disabled={pending}
            onClick={() => apply('shared', spaceId || operatedSpaces[0]!.id)}
            icon={<Users className="h-4 w-4" aria-hidden />}
            label="Shared"
          />
        )}
      </div>

      {visibility === 'shared' && canShare && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-muted">Share with the team at</span>
          <select
            value={spaceId}
            disabled={pending}
            onChange={(e) => apply('shared', e.target.value)}
            className="w-full max-w-xs rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-border-strong/30 disabled:opacity-50"
          >
            {operatedSpaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="text-sm text-muted">
        {visibility === 'network' ? (
          <>
            Network: {where} can find this person and see their basic card (name, role, company). Your
            email, phone, notes, and tags stay private to you.
          </>
        ) : visibility === 'shared' ? (
          <>
            Shared: the team at {sharedSpaceName} can see this contact&rsquo;s card. Your private notes and
            tags stay yours, and you keep full control of the contact.
          </>
        ) : (
          <>
            Private: only you can see this contact.
            {canShare
              ? ' Switch to Network to let local stewards find them, or Shared to give a Space team you run their card.'
              : ' Switch to Network to let local stewards find them.'}
          </>
        )}
      </p>
    </div>
  )
}

function Choice({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
        active
          ? 'border-primary bg-primary-bg text-primary-strong'
          : 'border-border-strong text-text hover:bg-surface-elevated'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
