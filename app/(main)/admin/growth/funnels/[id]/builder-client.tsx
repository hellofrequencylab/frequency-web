'use client'

// The funnel builder (GE2-3/GE2-5, ADR-455): edit a funnel's identity + lifecycle and
// wire each stage to an existing component. Presentation-ready view-models in; gated
// actions dispatched out, then refresh. CONTENT-VOICE strings, semantic tokens only.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Link2, Plus } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import { PERSONA_ORDER } from '@/lib/onboarding/personas'
import { STAGE_KIND_META, REF_TYPE_META, type FunnelStageKind, type StageRefType } from '@/lib/funnels/templates'
import type { FunnelStage } from '@/lib/funnels/store'
import { updateFunnel, addStageLink, removeStageLink } from '../actions'

const STATUS_TONE: Record<string, StatusTone> = { active: 'success', draft: 'neutral', archived: 'neutral' }
const STATUSES: { value: string; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]
const ID_POINTER: ReadonlySet<StageRefType> = new Set(['entry_point', 'campaign', 'nurture'])
const REF_TYPES = Object.keys(REF_TYPE_META) as StageRefType[]

interface FunnelView {
  id: string
  name: string
  description: string | null
  persona: string | null
  goalEvent: string
  status: string
  stages: FunnelStage[]
}

export function FunnelBuilder({ funnel }: { funnel: FunnelView }) {
  return (
    <div className="space-y-6">
      <IdentityCard funnel={funnel} />
      <div className="space-y-3">
        {funnel.stages.length === 0 ? (
          <EmptyState variant="first-use" title="No stages." description="This funnel has no stages to wire." />
        ) : (
          funnel.stages.map((s) => <StageCard key={s.id} stage={s} />)
        )}
      </div>
    </div>
  )
}

function IdentityCard({ funnel }: { funnel: FunnelView }) {
  const [name, setName] = useState(funnel.name)
  const [description, setDescription] = useState(funnel.description ?? '')
  const [persona, setPersona] = useState(funnel.persona ?? '')
  const [goalEvent, setGoalEvent] = useState(funnel.goalEvent)
  const [status, setStatus] = useState(funnel.status)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  function save() {
    setErr(null)
    setSaved(false)
    start(async () => {
      const res = await updateFunnel({ id: funnel.id, name, description: description || null, persona: persona || null, goalEvent, status })
      if (isError(res)) {
        setErr(res.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-text">Funnel basics</h3>
        <StatusChip tone={STATUS_TONE[status] ?? 'neutral'} size="sm">
          <span className="capitalize">{status}</span>
        </StatusChip>
      </div>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="b-name">Name</Label>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="b-status">Status</Label>
            <select id="b-status" value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClasses}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="b-desc">Description</Label>
          <Textarea id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={400} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="b-persona">Persona</Label>
            <select id="b-persona" value={persona} onChange={(e) => setPersona(e.target.value)} className={fieldClasses}>
              <option value="">Any persona</option>
              {PERSONA_ORDER.map((p) => (
                <option key={p} value={p} className="capitalize">{p}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="b-goal">Goal event</Label>
            <Input id="b-goal" value={goalEvent} onChange={(e) => setGoalEvent(e.target.value)} maxLength={80} />
          </div>
        </div>
        {err && <p className="text-xs text-danger">{err}</p>}
        {saved && !err && <p className="text-xs text-success">Saved.</p>}
        <div>
          <Button size="sm" onClick={save} disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : 'Save basics'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StageCard({ stage }: { stage: FunnelStage }) {
  const meta = STAGE_KIND_META[stage.kind as FunnelStageKind]
  const [adding, setAdding] = useState(false)

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">
            <span className="mr-2 inline-flex items-center rounded-md bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
              {meta?.label ?? stage.kind}
            </span>
            {stage.label}
          </p>
          <p className="mt-0.5 text-xs text-muted">{meta?.blurb}</p>
        </div>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Link
          </Button>
        )}
      </div>

      {stage.links.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {stage.links.map((l) => (
            <LinkRow key={l.id} linkId={l.id} refType={l.refType} target={l.refId ?? l.refKey ?? ''} />
          ))}
        </ul>
      )}

      {adding && <AddLinkForm stageId={stage.id} onDone={() => setAdding(false)} />}
    </div>
  )
}

function LinkRow({ linkId, refType, target }: { linkId: string; refType: StageRefType; target: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function remove() {
    setErr(null)
    start(async () => {
      const res = await removeStageLink(linkId)
      if (isError(res)) { setErr(res.error); return }
      router.refresh()
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-elevated/50 px-3 py-1.5">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
      <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">{REF_TYPE_META[refType]?.label ?? refType}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-text">{target}</span>
      <button
        onClick={remove}
        disabled={pending}
        className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
        aria-label="Remove link"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {err && <span role="alert" className="w-full text-2xs text-danger">{err}</span>}
    </li>
  )
}

function AddLinkForm({ stageId, onDone }: { stageId: string; onDone: () => void }) {
  const [refType, setRefType] = useState<StageRefType>('lead_flow')
  const [target, setTarget] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  const useId = ID_POINTER.has(refType)

  function submit() {
    setErr(null)
    start(async () => {
      const res = await addStageLink({
        stageId,
        refType,
        refId: useId ? target : null,
        refKey: useId ? null : target,
      })
      if (isError(res)) {
        setErr(res.error)
        return
      }
      setTarget('')
      onDone()
      router.refresh()
    })
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`rt-${stageId}`}>Component</Label>
          <select
            id={`rt-${stageId}`}
            value={refType}
            onChange={(e) => setRefType(e.target.value as StageRefType)}
            className={fieldClasses}
          >
            {REF_TYPES.map((rt) => (
              <option key={rt} value={rt}>{REF_TYPE_META[rt].label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`tg-${stageId}`}>{useId ? 'Component id' : 'Slug or link'}</Label>
          <Input
            id={`tg-${stageId}`}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={useId ? 'uuid of the entry point / campaign / sequence' : 'welcome, /vs/partiful, https://…'}
          />
        </div>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !target.trim()}>
          {pending ? 'Linking…' : 'Add link'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>Cancel</Button>
      </div>
    </div>
  )
}
