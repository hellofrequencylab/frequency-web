'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Loader2, ChevronLeft, Trash2, Check, Save, StickyNote, Phone, Mail, Users, CheckSquare, Plus,
} from 'lucide-react'
import { updateDeal, moveDeal, deleteDeal, addActivity, toggleTask, deleteActivity } from '../../actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { formatMoney, type CrmStage, type CrmDeal, type CrmActivity } from '@/lib/crm/pipeline'
import { getInitials, relativeTime } from '@/lib/utils'

const ACTIVITY_META: Record<CrmActivity['kind'], { Icon: typeof StickyNote; label: string }> = {
  note: { Icon: StickyNote, label: 'Note' },
  call: { Icon: Phone, label: 'Call' },
  email: { Icon: Mail, label: 'Email' },
  meeting: { Icon: Users, label: 'Meeting' },
  task: { Icon: CheckSquare, label: 'Task' },
}

export function DealDetail({
  deal,
  stages,
  activities,
}: {
  deal: CrmDeal
  stages: CrmStage[]
  activities: CrmActivity[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // editable fields
  const [title, setTitle] = useState(deal.title)
  const [contact, setContact] = useState(deal.contact_name ?? '')
  const [value, setValue] = useState(String(deal.value ?? 0))
  const [close, setClose] = useState(deal.expected_close_date ?? '')
  const [source, setSource] = useState(deal.source ?? '')

  // add-activity
  const [actKind, setActKind] = useState<CrmActivity['kind']>('note')
  const [actBody, setActBody] = useState('')
  const [actDue, setActDue] = useState('')

  const wonStage = stages.find((s) => s.kind === 'won')
  const lostStage = stages.find((s) => s.kind === 'lost')

  function run(fn: () => Promise<ActionResult | void>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res && isError(res)) {
        setError(res.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  const dirty =
    title !== deal.title ||
    contact !== (deal.contact_name ?? '') ||
    value !== String(deal.value ?? 0) ||
    close !== (deal.expected_close_date ?? '') ||
    source !== (deal.source ?? '')

  const field = 'rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none'
  const statusTone =
    deal.status === 'won'
      ? 'bg-success-bg text-success'
      : deal.status === 'lost'
        ? 'bg-danger-bg/40 text-danger'
        : 'bg-primary-bg text-primary-strong'

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link href="/crm" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text">
        <ChevronLeft className="h-4 w-4" /> Pipeline
      </Link>

      {error && <p className="rounded-lg border border-danger-bg bg-danger-bg/30 px-3 py-2 text-sm text-danger">{error}</p>}

      {/* Header card — title, stage, value, the editable fields */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent text-xl font-bold text-text focus:outline-none"
              aria-label="Deal title"
            />
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusTone}`}>
              {deal.status}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="text-xs text-muted">Stage</label>
            <select
              value={deal.stage_id ?? ''}
              disabled={pending}
              onChange={(e) => run(() => moveDeal(deal.id, e.target.value))}
              className={field}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Contact
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Who" className={field} />
            {deal.member && (
              <Link href={`/people/${deal.member.handle}`} className="text-[11px] text-primary-strong hover:underline">
                Linked member · @{deal.member.handle}
              </Link>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Value ($)
            <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Expected close
            <input type="date" value={close} onChange={(e) => setClose(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Source
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. referral, event" className={field} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="text-base font-bold tabular-nums text-text">{formatMoney(Number(value) || 0, deal.currency)}</span>
            {deal.owner && (
              <span className="inline-flex items-center gap-1.5">
                {deal.owner.avatar_url ? (
                  <Image src={deal.owner.avatar_url} alt="" width={20} height={20} className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-bg text-[9px] font-semibold text-primary-strong">
                    {getInitials(deal.owner.display_name)}
                  </span>
                )}
                {deal.owner.display_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {wonStage && deal.stage_id !== wonStage.id && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => moveDeal(deal.id, wonStage.id))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-success px-3 py-1.5 text-sm font-semibold text-success transition-colors hover:bg-success-bg/40 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Won
              </button>
            )}
            {lostStage && deal.stage_id !== lostStage.id && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => moveDeal(deal.id, lostStage.id))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                Lost
              </button>
            )}
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={() =>
                run(() =>
                  updateDeal(deal.id, {
                    title,
                    contactName: contact,
                    value: Number(value) || 0,
                    expectedCloseDate: close || null,
                    source: source || null,
                  }),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
          </div>
        </div>
      </div>

      {/* Activities & tasks */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-sm font-bold text-text">Activity &amp; tasks</p>

        {/* Add */}
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={actKind} onChange={(e) => setActKind(e.target.value as CrmActivity['kind'])} className={field}>
              {(['note', 'call', 'email', 'meeting', 'task'] as const).map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY_META[k].label}
                </option>
              ))}
            </select>
            {actKind === 'task' && (
              <input type="datetime-local" value={actDue} onChange={(e) => setActDue(e.target.value)} className={field} title="Due" />
            )}
          </div>
          <textarea
            value={actBody}
            onChange={(e) => setActBody(e.target.value)}
            rows={2}
            placeholder={actKind === 'task' ? 'What needs doing?' : 'Log a note, call, email, or meeting…'}
            className={`w-full ${field}`}
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={pending || (!actBody.trim() && actKind !== 'task')}
              onClick={() =>
                run(
                  () => addActivity({ dealId: deal.id, kind: actKind, body: actBody, dueAt: actDue ? new Date(actDue).toISOString() : null }),
                  () => {
                    setActBody('')
                    setActDue('')
                  },
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </button>
          </div>
        </div>

        {/* Timeline */}
        <ul className="mt-4 space-y-2">
          {activities.length === 0 && <li className="py-4 text-center text-sm text-subtle">No activity yet.</li>}
          {activities.map((a) => {
            const { Icon, label } = ACTIVITY_META[a.kind]
            const isTask = a.kind === 'task'
            const done = !!a.completed_at
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                {isTask ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => toggleTask(a.id, deal.id, !done))}
                    aria-label={done ? 'Mark task not done' : 'Mark task done'}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      done ? 'border-success bg-success text-on-primary' : 'border-border-strong hover:border-primary'
                    }`}
                  >
                    {done && <Check className="h-3.5 w-3.5" />}
                  </button>
                ) : (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-subtle">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</span>
                    {a.due_at && !done && (
                      <span className="text-[11px] text-warning">due {new Date(a.due_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                    {done && <span className="text-[11px] text-success">done</span>}
                  </div>
                  {a.body && <p className={`mt-0.5 whitespace-pre-wrap text-sm ${done ? 'text-subtle line-through' : 'text-text'}`}>{a.body}</p>}
                  <p className="mt-0.5 text-[11px] text-subtle">
                    {a.author?.display_name ? `${a.author.display_name} · ` : ''}
                    {relativeTime(a.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteActivity(a.id, deal.id))}
                  aria-label="Delete"
                  className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Danger */}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => deleteDeal(deal.id), () => router.push('/crm'))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg/30 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" /> Delete deal
        </button>
      </div>
    </div>
  )
}
