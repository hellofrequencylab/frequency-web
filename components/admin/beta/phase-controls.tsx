'use client'

import { useState, useTransition } from 'react'
import { Megaphone, Users, ShieldCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusChip, Banner, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { OutboundItem, ApprovalStatus } from '@/lib/beta/approvals'
import type { PhaseStatus } from '@/lib/beta/phases'
import type { TaskStatus } from '@/lib/beta/tasks'
import {
  approveOutbound,
  pauseOutbound,
  armPhaseAction,
} from '@/app/(main)/admin/beta/actions'
import {
  setPhaseStatusAction,
  setTaskStatusAction,
} from '@/app/(main)/admin/beta/phase-actions'

// Phases tab — the interactive islands (Wave 2). Everything static (goals, the
// "done when…" acceptance, the phase copy) is server-rendered by phases-section.tsx;
// only the controls below are client. Three islands:
//   • PhaseStatusControl / TaskStatusControl — content-writer-gated status edits.
//   • PhaseOutbound — the phase's outbound queue + the "Arm this phase" button
//     (approver-gated; the button is hidden for non-approvers). Arming takes a
//     deliberate confirm click, because it is the send-authorizing act.

// ── status vocabularies → the shared admin tone set ──────────────────────────

const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
}
const PHASE_STATUS_TONE: Record<PhaseStatus, StatusTone> = {
  not_started: 'neutral',
  in_progress: 'info',
  done: 'success',
}
const PHASE_STATUS_ORDER: PhaseStatus[] = ['not_started', 'in_progress', 'done']

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
}
const TASK_STATUS_TONE: Record<TaskStatus, StatusTone> = {
  not_started: 'neutral',
  in_progress: 'info',
  done: 'success',
  blocked: 'danger',
}
const TASK_STATUS_ORDER: TaskStatus[] = ['not_started', 'in_progress', 'done', 'blocked']

const APPROVAL_TONE: Record<ApprovalStatus, StatusTone> = {
  draft: 'neutral',
  ready: 'warning',
  approved: 'success',
  scheduled: 'info',
  sending: 'info',
  sent: 'success',
  paused: 'warning',
  cancelled: 'danger',
}
const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  approved: 'Armed',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  paused: 'Paused',
  cancelled: 'Cancelled',
}

const selectClass =
  'rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50'

// ── Phase status ─────────────────────────────────────────────────────────────

export function PhaseStatusControl({
  phaseId,
  status,
}: {
  phaseId: string
  status: PhaseStatus
}) {
  const [current, setCurrent] = useState<PhaseStatus>(status)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function change(next: PhaseStatus) {
    const prev = current
    setError(null)
    setCurrent(next)
    startTransition(async () => {
      const result = await setPhaseStatusAction(phaseId, next)
      if (isError(result)) {
        setCurrent(prev)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <StatusChip tone={PHASE_STATUS_TONE[current]}>{PHASE_STATUS_LABEL[current]}</StatusChip>
      <label className="sr-only" htmlFor={`phase-status-${phaseId}`}>
        Phase status
      </label>
      <select
        id={`phase-status-${phaseId}`}
        className={selectClass}
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value as PhaseStatus)}
      >
        {PHASE_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {PHASE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {error && <span className="text-2xs font-semibold text-danger">{error}</span>}
    </div>
  )
}

// ── Task status ──────────────────────────────────────────────────────────────

export function TaskStatusControl({
  taskId,
  status,
}: {
  taskId: string
  status: TaskStatus
}) {
  const [current, setCurrent] = useState<TaskStatus>(status)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function change(next: TaskStatus) {
    const prev = current
    setError(null)
    setCurrent(next)
    startTransition(async () => {
      const result = await setTaskStatusAction(taskId, next)
      if (isError(result)) {
        setCurrent(prev)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <StatusChip tone={TASK_STATUS_TONE[current]} size="sm">
        {TASK_STATUS_LABEL[current]}
      </StatusChip>
      <label className="sr-only" htmlFor={`task-status-${taskId}`}>
        Task status
      </label>
      <select
        id={`task-status-${taskId}`}
        className={selectClass}
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value as TaskStatus)}
      >
        {TASK_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {error && <span className="text-2xs font-semibold text-danger">{error}</span>}
    </div>
  )
}

// ── The phase's outbound queue + arm ─────────────────────────────────────────

const TYPE_META = {
  campaign: { Icon: Megaphone, noun: 'Campaign' },
  admission_wave: { Icon: Users, noun: 'Admission wave' },
} as const

export function PhaseOutbound({
  phaseId,
  items,
  canArm,
}: {
  phaseId: string
  items: OutboundItem[]
  /** Approver (admin/janitor) only. Non-approvers see status but no arm/approve. */
  canArm: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmArm, setConfirmArm] = useState(false)

  const readyCount = items.filter((i) => i.approvalStatus === 'ready').length

  function runItem(item: OutboundItem, action: 'approve' | 'pause') {
    setError(null)
    setNotice(null)
    setBusyId(item.id)
    startTransition(async () => {
      const result =
        action === 'approve'
          ? await approveOutbound(item.type, item.id)
          : await pauseOutbound(item.type, item.id)
      setBusyId(null)
      if (isError(result)) setError(result.error)
    })
  }

  function arm() {
    setError(null)
    setNotice(null)
    setConfirmArm(false)
    setBusyId('__arm__')
    startTransition(async () => {
      const result = await armPhaseAction(phaseId)
      setBusyId(null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      const n = result.data.approved
      setNotice(n === 0 ? 'Nothing was ready to arm.' : `Armed ${n} ${n === 1 ? 'item' : 'items'}.`)
    })
  }

  const arming = pending && busyId === '__arm__'

  return (
    <div className="space-y-3">
      {error && (
        <Banner tone="critical" title="That action did not go through" dismissible>
          {error}
        </Banner>
      )}
      {notice && (
        <Banner tone="info" title={notice} dismissible>
          Nothing sends on its own. Armed items clear the send gate for the launch runner.
        </Banner>
      )}

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted">
          No campaigns or admission waves are filed under this phase yet.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((item) => {
            const meta = TYPE_META[item.type]
            const busy = pending && busyId === item.id
            const isReady = item.approvalStatus === 'ready'
            const isPaused = item.approvalStatus === 'paused'
            return (
              <li
                key={`${item.type}:${item.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <meta.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{item.label}</p>
                  <p className="text-xs text-muted">
                    {meta.noun}
                    {item.count != null && ` · ${item.count.toLocaleString()} recipients`}
                    {item.segment && ` · ${item.segment}`}
                  </p>
                </div>
                <StatusChip tone={APPROVAL_TONE[item.approvalStatus]} size="sm">
                  {APPROVAL_LABEL[item.approvalStatus]}
                </StatusChip>
                {canArm && (isReady || isPaused) && (
                  <div className="flex shrink-0 items-center gap-2">
                    {isReady && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => runItem(item, 'pause')}
                      >
                        Pause
                      </Button>
                    )}
                    <Button size="sm" disabled={busy} onClick={() => runItem(item, 'approve')}>
                      {busy ? 'Working…' : isPaused ? 'Re-arm' : 'Arm'}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canArm ? (
        <div className="flex flex-wrap items-center gap-3">
          {confirmArm ? (
            <>
              <span className="text-sm font-semibold text-text">
                Arm {readyCount} ready {readyCount === 1 ? 'item' : 'items'} in this phase?
              </span>
              <Button size="sm" disabled={arming} onClick={arm}>
                {arming ? 'Arming…' : 'Yes, arm this phase'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={arming}
                onClick={() => setConfirmArm(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={readyCount === 0 || arming}
                onClick={() => setConfirmArm(true)}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Arm this phase
              </Button>
              <span className="text-xs text-muted">
                {readyCount === 0
                  ? 'Mark items ready first. Nothing sends until you arm it.'
                  : `${readyCount} ready. Nothing sends until you arm it.`}
              </span>
            </>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Arming is limited to an admin or executive admin.
        </p>
      )}
    </div>
  )
}
