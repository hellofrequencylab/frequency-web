'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createDeal, updateDeal, moveDeal } from '@/app/(main)/admin/crm/actions'
import type { CrmStage, CrmDeal } from '@/lib/crm/pipeline-core'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/field'

// The label TEXT class. Every field below wraps its control in a native <label>, which is HTML's
// own implicit association: no id to mint, no htmlFor to thread. The previous shape put the
// <label> BESIDE the control, so it named nothing and each control needed a duplicate `aria-label`
// to have any name at all (ADR-966).
const label = 'block text-meta font-semibold text-subtle mb-1'

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
      router.push('/admin/growth?tab=crm')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 lift-1">
      <label className="block">
        <span className={label}>Title *</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Partner: Encinitas Yoga" autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Contact</span>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Name" />
        </label>
        <label className="block">
          <span className={label}>Value</span>
          <Input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Stage</span>
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className={label}>Expected close</span>
          <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className={label}>Source</span>
        <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where it came from" />
      </label>

      {error && <p className="text-meta text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={() => router.push('/admin/growth?tab=crm')} className="rounded-lg px-4 py-2 text-body-sm font-medium text-subtle hover:text-text">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || pending}
          className="rounded-lg bg-primary px-5 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : deal ? 'Save deal' : 'Create deal'}
        </button>
      </div>
    </div>
  )
}
