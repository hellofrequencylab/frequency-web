'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeftRight, Check, Loader2, PauseCircle, PlayCircle, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { SpaceStatus } from '@/lib/spaces/types'
import {
  setSpaceStatus,
  transferSpaceOwnership,
} from '@/app/(main)/admin/spaces/[id]/lifecycle-actions'

// The platform-admin LIFECYCLE + OWNERSHIP-TRANSFER controls for one Space (Entity Management
// Overhaul EM1-6). A sensitive operator surface: lifecycle moves the Space along
// active/suspended/archived; transfer reassigns the owner. The destructive/transfer actions gate
// behind an explicit confirmation step (the Dialog) so a stray click can't suspend a live tenant or
// hand a Space to the wrong person. Each action calls a staff-gated server action that re-checks
// authorization and writes an audit entry; this component only collects intent and surfaces the
// result. Token-only styling; no em dashes (CONTENT-VOICE).

export interface OwnerCandidate {
  profileId: string
  /** Display name + handle for the picker. */
  name: string
  handle: string | null
  role: string
}

const STATUS_TONE: Record<SpaceStatus, StatusTone> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
}

const STATUS_LABEL: Record<SpaceStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
}

/** One lifecycle target, the human framing of moving the Space there. */
type LifecycleTarget = {
  to: SpaceStatus
  label: string
  blurb: string
  icon: typeof PauseCircle
  variant: 'warningOutline' | 'dangerOutline' | 'successOutline'
  confirm: boolean
}

export function SpaceLifecyclePanel({
  spaceId,
  spaceName,
  status,
  ownerName,
  candidates,
}: {
  spaceId: string
  spaceName: string
  status: SpaceStatus
  /** The current owner's display name, or null if the Space has no owner on file. */
  ownerName: string | null
  /** The profiles an operator may transfer ownership to (the Space's members). */
  candidates: OwnerCandidate[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // The pending lifecycle move awaiting confirmation (null = no dialog open).
  const [lifecycleConfirm, setLifecycleConfirm] = useState<LifecycleTarget | null>(null)
  // The ownership-transfer dialog: open + the selected new owner.
  const [transferOpen, setTransferOpen] = useState(false)
  const [selectedOwner, setSelectedOwner] = useState('')

  // The transitions available FROM the current status. We never offer the no-op (current) state.
  const targets: LifecycleTarget[] = []
  if (status !== 'active') {
    targets.push({
      to: 'active',
      label: 'Reactivate',
      blurb: 'Make this space active and visible in the network again.',
      icon: PlayCircle,
      variant: 'successOutline',
      confirm: false,
    })
  }
  if (status !== 'suspended') {
    targets.push({
      to: 'suspended',
      label: 'Suspend',
      blurb: 'Hide this space from the network while you sort something out. It can be reactivated later.',
      icon: PauseCircle,
      variant: 'warningOutline',
      confirm: true,
    })
  }
  if (status !== 'archived') {
    targets.push({
      to: 'archived',
      label: 'Archive',
      blurb: 'Retire this space. It stays on file but leaves the network. It can be reactivated later.',
      icon: Archive,
      variant: 'dangerOutline',
      confirm: true,
    })
  }

  function runStatus(to: SpaceStatus) {
    setError(null)
    start(async () => {
      const result = await setSpaceStatus(spaceId, to)
      setLifecycleConfirm(null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function onLifecycleClick(t: LifecycleTarget) {
    if (t.confirm) setLifecycleConfirm(t)
    else runStatus(t.to)
  }

  function runTransfer() {
    if (!selectedOwner) return
    setError(null)
    start(async () => {
      const result = await transferSpaceOwnership(spaceId, selectedOwner)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setTransferOpen(false)
      setSelectedOwner('')
      router.refresh()
    })
  }

  const selected = candidates.find((c) => c.profileId === selectedOwner) ?? null

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Lifecycle */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text">Lifecycle</h3>
            <p className="mt-0.5 text-xs text-muted">
              Where this space sits in the network. Suspend or archive takes it out of view; reactivate brings it back.
            </p>
          </div>
          <StatusChip tone={STATUS_TONE[status]} size="sm">
            {STATUS_LABEL[status]}
          </StatusChip>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {targets.map((t) => (
            <Button
              key={t.to}
              type="button"
              variant={t.variant}
              size="sm"
              onClick={() => onLifecycleClick(t)}
              disabled={pending}
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Ownership */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text">Ownership</h3>
            <p className="mt-0.5 text-xs text-muted">
              The person who owns this space. Transfer hands the owner role to another member.
            </p>
          </div>
          <span className="text-sm font-medium text-text">{ownerName ?? 'No owner on file'}</span>
        </div>
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null)
              setTransferOpen(true)
            }}
            disabled={pending || candidates.length === 0}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Transfer ownership
          </Button>
          {candidates.length === 0 && (
            <p className="mt-2 text-xs text-subtle">
              Add a member to this space first. Ownership can only move to one of its members.
            </p>
          )}
        </div>
      </div>

      {/* Lifecycle confirmation */}
      <Dialog
        open={lifecycleConfirm !== null}
        onClose={() => !pending && setLifecycleConfirm(null)}
        ariaLabel="Confirm lifecycle change"
        className="max-w-md"
      >
        {lifecycleConfirm && (
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-bg text-warning">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-text">
                  {lifecycleConfirm.label} {spaceName}?
                </h2>
                <p className="mt-1 text-sm text-muted">{lifecycleConfirm.blurb}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLifecycleConfirm(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={lifecycleConfirm.variant}
                size="sm"
                onClick={() => runStatus(lifecycleConfirm.to)}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Working…
                  </>
                ) : (
                  <>{lifecycleConfirm.label}</>
                )}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Transfer confirmation */}
      <Dialog
        open={transferOpen}
        onClose={() => !pending && setTransferOpen(false)}
        ariaLabel="Transfer ownership"
        className="max-w-md"
      >
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
              <ArrowLeftRight className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-text">Transfer {spaceName}</h2>
              <p className="mt-1 text-sm text-muted">
                Pick the new owner. They get the owner role and full admin standing on this space. The current owner
                keeps their membership but no longer owns it.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="new-owner" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              New owner
            </label>
            <select
              id="new-owner"
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
              disabled={pending}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
            >
              <option value="">Choose a member…</option>
              {candidates.map((c) => (
                <option key={c.profileId} value={c.profileId}>
                  {c.name}
                  {c.handle ? ` (@${c.handle})` : ''} · {c.role}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <p className="mt-3 rounded-lg bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
              Ownership of {spaceName} will move to {selected.name}. This is recorded in the audit log.
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTransferOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={runTransfer} disabled={pending || !selectedOwner}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Transferring…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Transfer ownership
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
