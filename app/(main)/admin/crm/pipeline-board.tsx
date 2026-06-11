'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, ChevronLeft, ChevronRight, CalendarClock, Pencil } from 'lucide-react'
import { createDeal, moveDeal } from './actions'
import { isError } from '@/lib/action-result'
import { formatMoney, type CrmStage, type CrmDeal, type PersonLite } from '@/lib/crm/pipeline'
import { getInitials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'

export function PipelineBoard({ stages, deals }: { stages: CrmStage[]; deals: CrmDeal[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // new-deal form
  const [title, setTitle] = useState('')
  const [contact, setContact] = useState('')
  const [value, setValue] = useState('')
  const [stageId, setStageId] = useState(stages[0]?.id ?? '')
  const [close, setClose] = useState('')

  function run(fn: () => Promise<string | null>, after?: () => void) {
    setError(null)
    start(async () => {
      const err = await fn()
      if (err) {
        setError(err)
        return
      }
      after?.()
      router.refresh()
    })
  }

  function submitNew() {
    if (!title.trim()) {
      setError('A deal needs a title.')
      return
    }
    run(
      async () => {
        const res = await createDeal({
          title,
          contactName: contact,
          value: value ? Number(value) : 0,
          stageId,
          expectedCloseDate: close || null,
        })
        return isError(res) ? res.error : null
      },
      () => {
        setTitle('')
        setContact('')
        setValue('')
        setClose('')
        setAdding(false)
      },
    )
  }

  const byStage = (id: string) => deals.filter((d) => d.stage_id === id)
  const stageValue = (id: string) => byStage(id).reduce((s, d) => s + (d.value || 0), 0)
  const field = 'rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-border-strong focus:outline-none'

  return (
    <div className="space-y-4">
      {error && (
        <Banner tone="critical" title="That didn’t go through">
          {error}
        </Banner>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {deals.length} deal{deals.length === 1 ? '' : 's'} across {stages.length} stages
        </p>
        <Button type="button" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> Quick add
        </Button>
      </div>

      {adding && (
        <div className="grid gap-2 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title" className={`lg:col-span-2 ${field}`} />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact (optional)" className={field} />
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value $"
            className={field}
          />
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={field}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input type="date" value={close} onChange={(e) => setClose(e.target.value)} className={`min-w-0 flex-1 ${field}`} title="Expected close" />
            <Button type="button" size="sm" disabled={pending} onClick={submitNew} className="shrink-0">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </Button>
          </div>
        </div>
      )}

      {/* Board — horizontally scrolling stage columns */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const items = byStage(stage.id)
          return (
            <div key={stage.id} className="w-72 shrink-0 rounded-2xl border border-border bg-surface-elevated/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${stage.kind === 'won' ? 'bg-success' : stage.kind === 'lost' ? 'bg-danger' : 'bg-primary'}`} />
                  <p className="truncate text-sm font-semibold text-text">{stage.name}</p>
                  <span className="shrink-0 text-xs tabular-nums text-subtle">{items.length}</span>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted">{formatMoney(stageValue(stage.id))}</span>
              </div>
              <div className="space-y-2">
                {items.map((deal) => (
                  <DealCard key={deal.id} deal={deal} stages={stages} pending={pending} onMove={(sid) => run(async () => {
                    const res = await moveDeal(deal.id, sid)
                    return isError(res) ? res.error : null
                  })} />
                ))}
                {items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">No deals</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Avatar({ person }: { person: PersonLite }) {
  return person.avatar_url ? (
    <Image src={person.avatar_url} alt={person.display_name} width={20} height={20} className="h-5 w-5 rounded-full object-cover" />
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-bg text-2xs font-semibold text-primary-strong select-none">
      {getInitials(person.display_name)}
    </span>
  )
}

function DealCard({
  deal,
  stages,
  pending,
  onMove,
}: {
  deal: CrmDeal
  stages: CrmStage[]
  pending: boolean
  onMove: (stageId: string) => void
}) {
  const idx = stages.findIndex((s) => s.id === deal.stage_id)
  const prev = idx > 0 ? stages[idx - 1] : null
  const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null
  const who = deal.member?.display_name ?? deal.contact_name

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <Link href={`/admin/crm/deals/${deal.id}`} className="block min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-text hover:underline">{deal.title}</p>
        </Link>
        <Link
          href={`/admin/crm/deals/${deal.id}/edit`}
          aria-label="Edit deal"
          className="shrink-0 rounded p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </div>
      {who && <p className="mt-0.5 truncate text-xs text-muted">{who}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold tabular-nums text-text">{formatMoney(deal.value, deal.currency)}</span>
        {deal.owner && <Avatar person={deal.owner} />}
      </div>
      {deal.expected_close_date && (
        <p className="mt-1 flex items-center gap-1 text-xs text-subtle">
          <CalendarClock className="h-3 w-3" />
          {new Date(deal.expected_close_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-1">
        <button
          type="button"
          disabled={!prev || pending}
          onClick={() => prev && onMove(prev.id)}
          title={prev ? `Move to ${prev.name}` : 'First stage'}
          className="rounded-md border border-border p-1 text-muted transition-colors hover:text-text disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="truncate text-2xs font-semibold uppercase tracking-wide text-subtle">{stages[idx]?.name ?? '–'}</span>
        <button
          type="button"
          disabled={!next || pending}
          onClick={() => next && onMove(next.id)}
          title={next ? `Move to ${next.name}` : 'Last stage'}
          className="rounded-md border border-border p-1 text-muted transition-colors hover:text-text disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
