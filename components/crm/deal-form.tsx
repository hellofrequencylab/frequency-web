'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDeal, updateDeal, moveDeal } from '@/app/(main)/crm/actions'
import type { CrmStage, CrmDeal } from '@/lib/crm/pipeline'

const input =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-broadcast'
const label = 'block text-xs font-semibold text-subtle mb-1'

// Create / edit a CRM deal (build §9.5). Wires the UI gap to the existing actions
// (createDeal / updateDeal / moveDeal) — no new backend.
export function DealForm({ stages, deal }: { stages: CrmStage[]; deal?: CrmDeal }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [title, setTitle] = useState(deal?.title ?? '')
  const [contactName, setContactName] = useState(deal?.contact_name ?? '')
  const [value, setValue] = useState(deal ? String(deal.value) : '')
  const [stageId, setStageId] = useState(deal?.stage_id ?? stages[0]?.id ?? '')
  const [closeDate, setCloseDate] = useState(deal?.expected_close_date?.slice(0, 10) ?? '')
  const [source, setSource] = useState(deal?.source ?? '')

  function submit() {
    const t = title.trim()
    if (!t || pending) return
    setError('')
    start(async () => {
      const num = value.trim() ? Number(value) : 0
      if (deal) {
        const r = await updateDeal(deal.id, {
          title: t,
          contactName: contactName.trim() || null,
          value: num,
          expectedCloseDate: closeDate || null,
          source: source.trim() || null,
        })
        if ('error' in r) return setError(r.error)
        if (stageId && stageId !== deal.stage_id) await moveDeal(deal.id, stageId)
      } else {
        const r = await createDeal({
          title: t,
          contactName: contactName.trim() || undefined,
          value: num,
          stageId,
          expectedCloseDate: closeDate || null,
          source: source.trim() || undefined,
        })
        if ('error' in r) return setError(r.error)
      }
      router.push('/crm')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <label className={label}>Title *</label>
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Partner: Encinitas Yoga" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Contact</label>
          <input className={input} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" />
        </div>
        <div>
          <label className={label}>Value</label>
          <input className={input} type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Stage</label>
          <select className={input} value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Expected close</label>
          <input className={input} type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={label}>Source</label>
        <input className={input} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where it came from" />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={() => router.push('/crm')} className="rounded-lg px-4 py-2 text-sm font-medium text-subtle hover:text-text">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || pending}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : deal ? 'Save deal' : 'Create deal'}
        </button>
      </div>
    </div>
  )
}
