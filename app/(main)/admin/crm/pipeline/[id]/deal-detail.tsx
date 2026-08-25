'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Loader2, Trash2, Check, Save, StickyNote, Phone, Mail, Users, CheckSquare, Plus,
} from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import type { PageHeroSize, HeroOverlayStyle } from '@/components/templates/page-hero'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { StatusChip, Banner, type StatusTone } from '@/components/admin/status'
import { DangerModal } from '@/components/admin/danger-modal'
import { updateDeal, moveDeal, deleteDeal, addActivity, toggleTask, deleteActivity } from '../../actions'
import { isError, type ActionResult } from '@/lib/action-result'
import { formatMoney, type CrmStage, type CrmDeal, type CrmActivity } from '@/lib/crm/pipeline-core'
import { PIPELINE_LANES, laneMeta, type PipelineLane } from '@/lib/crm/stage-templates'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

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
  hero,
}: {
  deal: CrmDeal
  stages: CrmStage[]
  activities: CrmActivity[]
  /** The standard entity cover (PROG-P5, ADR-1136), resolved by the SERVER page — this client
   *  island cannot call the server-only resolver, so the page hands it the spreadable bag. */
  hero?: {
    coverImage?: string | null
    coverFocus?: string | null
    coverSize?: PageHeroSize
    coverOverlayStyle?: HeroOverlayStyle
  }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // editable fields
  const [title, setTitle] = useState(deal.title)
  const [contact, setContact] = useState(deal.contact_name ?? '')
  const [value, setValue] = useState(String(deal.value ?? 0))
  const [close, setClose] = useState(deal.expected_close_date ?? '')
  // A card's lane rides `source`. Default an untagged card to the Business-upsell lane so a saved card is
  // always in one lane (the board can then filter it).
  const [source, setSource] = useState(laneMeta(deal.source)?.id ?? PIPELINE_LANES[0]!.id)

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
    source !== (laneMeta(deal.source)?.id ?? PIPELINE_LANES[0]!.id)

  const field = 'px-2.5 py-1.5'
  const statusTone: StatusTone = deal.status === 'won' ? 'success' : deal.status === 'lost' ? 'danger' : 'info'

  return (
    <div className="mx-auto w-full max-w-3xl">
      <DetailTemplate
        {...hero}
        back={{ href: '/admin/crm/pipeline', label: 'Pipeline' }}
        title={
          <Input
            variant="seamless"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full min-w-0 text-lead font-bold text-text sm:text-page-title"
            aria-label="Card title"
          />
        }
        badges={
          <StatusChip tone={statusTone}>
            <span className="capitalize">{deal.status}</span>
          </StatusChip>
        }
        actions={
          <>
            <div className="flex items-center gap-2">
              <label className="text-meta text-muted" htmlFor="deal-stage">Stage</label>
              <Select
                id="deal-stage"
                value={deal.stage_id ?? ''}
                disabled={pending}
                onChange={(e) => run(() => moveDeal(deal.id, e.target.value))}
                wrapperClassName="inline-block w-max max-w-full"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            {wonStage && deal.stage_id !== wonStage.id && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => moveDeal(deal.id, wonStage.id))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-success px-3 py-1.5 text-body-sm font-semibold text-success transition-colors hover:bg-success-bg/40 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Won
              </button>
            )}
            {lostStage && deal.stage_id !== lostStage.id && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => moveDeal(deal.id, lostStage.id))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                Lost
              </button>
            )}
            <Button
              type="button"
              size="sm"
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
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </>
        }
      >
      <div className="space-y-6">
      {error && <Banner tone="critical" title="That didn’t go through">{error}</Banner>}

      {/* Editable fields */}
      <div className="rounded-2xl border border-border bg-surface p-5 lift-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-meta text-muted">
            Contact
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Who" className={field} />
            {deal.member && (
              <Link href={`/people/${deal.member.handle}`} className="text-meta text-primary-strong hover:underline">
                Linked member · @{deal.member.handle}
              </Link>
            )}
          </label>
          <label className="flex flex-col gap-1 text-meta text-muted">
            Value ($)
            <Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-meta text-muted">
            Expected close
            <Input type="date" value={close} onChange={(e) => setClose(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-meta text-muted">
            Lane
            <Select value={source} onChange={(e) => setSource(e.target.value as PipelineLane)}>
              {PIPELINE_LANES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-3 text-meta text-muted">
            <span className="text-body font-bold tabular-nums text-text">{formatMoney(Number(value) || 0, deal.currency)}</span>
            {deal.owner && (
              <span className="inline-flex items-center gap-1.5">
                {deal.owner.avatar_url ? (
                  <Image src={avatarSrc(deal.owner.avatar_url)} alt="" width={20} height={20} className="h-5 w-5 rounded-pill object-cover" style={avatarFocusStyle(deal.owner.avatar_url)} />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-pill bg-primary-bg text-2xs font-semibold text-primary-strong">
                    {getInitials(deal.owner.display_name)}
                  </span>
                )}
                {deal.owner.display_name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Activities & tasks */}
      <div className="rounded-2xl border border-border bg-surface p-5 lift-1">
        <p className="text-body-sm font-bold text-text">Activity &amp; tasks</p>

        {/* Add */}
        <div className="mt-3 space-y-2 rounded-card border border-border bg-surface-elevated/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={actKind}
              onChange={(e) => setActKind(e.target.value as CrmActivity['kind'])}
              aria-label="Activity type"
              wrapperClassName="inline-block w-max max-w-full"
            >
              {(['note', 'call', 'email', 'meeting', 'task'] as const).map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY_META[k].label}
                </option>
              ))}
            </Select>
            {actKind === 'task' && (
              <Input type="datetime-local" aria-label="Due" value={actDue} onChange={(e) => setActDue(e.target.value)} className={field} title="Due" />
            )}
          </div>
          <Textarea
            aria-label={actKind === 'task' ? 'What needs doing' : 'Activity note'}
            value={actBody}
            onChange={(e) => setActBody(e.target.value)}
            rows={2}
            placeholder={actKind === 'task' ? 'What needs doing?' : 'Log a note, call, email, or meeting…'}
            className={field}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
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
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <ul className="mt-4 space-y-2">
          {activities.length === 0 && <li className="py-4 text-center text-body-sm text-subtle">No activity yet.</li>}
          {activities.map((a) => {
            const { Icon, label } = ACTIVITY_META[a.kind]
            const isTask = a.kind === 'task'
            const done = !!a.completed_at
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-card border border-border bg-surface p-3">
                {/* TOUCH TARGET: the floor goes on a WRAPPER, not on the 20px marker itself (same
                    split as components/ui/checkbox.tsx), so the task box stays the same size as the
                    static activity marker it alternates with down the timeline. Growing the flex item
                    keeps `gap-3` intact at every floor, so nothing overlaps the body column; the
                    non-task rows take the same floor as a spacer so the gutter never jumps. */}
                {isTask ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => toggleTask(a.id, deal.id, !done))}
                    aria-label={done ? 'Mark task not done' : 'Mark task done'}
                    className="tap-target group/check mt-0.5 inline-flex shrink-0 items-start"
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                        done ? 'border-success bg-success text-on-success' : 'border-border-strong group-hover/check:border-primary'
                      }`}
                    >
                      {done && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                ) : (
                  <span className="tap-target mt-0.5 inline-flex shrink-0 items-start">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-elevated text-subtle">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-meta font-semibold uppercase tracking-wide text-subtle">{label}</span>
                    {a.due_at && !done && (
                      <StatusChip tone="warning" size="sm">due {new Date(a.due_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</StatusChip>
                    )}
                    {done && <StatusChip tone="success" size="sm">done</StatusChip>}
                  </div>
                  {a.body && <p className={`mt-0.5 whitespace-pre-wrap text-body-sm ${done ? 'text-subtle line-through' : 'text-text'}`}>{a.body}</p>}
                  <p className="mt-0.5 text-meta text-subtle">
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
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-body-sm font-semibold text-danger transition-colors hover:bg-danger-bg/30 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" /> Delete card
        </button>
      </div>
      </div>
      </DetailTemplate>

      <DangerModal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete card"
        body="This removes the card and its activity timeline. This cannot be undone."
        confirmLabel="Delete card"
        onConfirm={() => run(() => deleteDeal(deal.id), () => router.push('/admin/crm/pipeline'))}
      />
    </div>
  )
}
