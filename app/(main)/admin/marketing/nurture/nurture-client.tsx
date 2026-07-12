'use client'

// Per-persona nurture manager (ADR-131). One card per persona: create/toggle its
// sequence and edit the timed email steps. Reuses the marketing workspace chrome.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronDown, ChevronRight, Clock, LayoutTemplate } from 'lucide-react'
import { createSequence, toggleSequence, addStep, updateStep, deleteStep } from './actions'
import { StatusChip } from '@/components/admin/status'
import { starterRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import { StepBlockEditor } from './step-block-editor'

export interface StepRowData {
  id: string
  order: number
  delayHours: number
  subject: string
  body: string
  enabled: boolean
  /** The step's block-editor body (kind 'email'), or null when it still uses the plain `body`. */
  blockJson: EntityLayout | null
}
export interface PersonaRow {
  persona: string
  label: string
  emoji: string
  pitch: string
  sequence: { id: string; enabled: boolean; active: number; completed: number; steps: StepRowData[] } | null
}

const field = 'w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text'

function humanDelay(hours: number): string {
  if (hours <= 0) return 'immediately'
  if (hours < 24) return `after ${hours}h`
  const days = Math.round(hours / 24)
  return `after ${days} day${days === 1 ? '' : 's'}`
}

export function NurtureManager({ rows }: { rows: PersonaRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <PersonaCard key={row.persona} row={row} />
      ))}
    </div>
  )
}

function PersonaCard({ row }: { row: PersonaRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const seq = row.sequence

  function create() {
    setError(null)
    start(async () => {
      const r = await createSequence(row.persona)
      if ('error' in r) { setError(r.error); return }
      setOpen(true)
      router.refresh()
    })
  }
  function toggle() {
    if (!seq) return
    setError(null)
    start(async () => {
      const r = await toggleSequence(seq.id, !seq.enabled)
      if ('error' in r) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <span className="text-2xl leading-none" aria-hidden>{row.emoji}</span>
        <button
          onClick={() => seq && setOpen((o) => !o)}
          className="min-w-0 flex-1 text-left"
          disabled={!seq}
        >
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold text-text">{row.label}</h3>
            {seq && <StatusChip tone={seq.enabled ? 'success' : 'neutral'} size="sm">{seq.enabled ? 'Live' : 'Paused'}</StatusChip>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {seq
              ? <>{seq.steps.length} step{seq.steps.length === 1 ? '' : 's'} · <span className="font-semibold text-text">{seq.active}</span> in sequence · {seq.completed} completed</>
              : <>“{row.pitch}” (no sequence yet)</>}
          </p>
        </button>

        {seq ? (
          <>
            <button
              onClick={toggle}
              disabled={pending}
              className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
            >
              {seq.enabled ? 'Pause' : 'Resume'}
            </button>
            <button onClick={() => setOpen((o) => !o)} className="text-subtle hover:text-text" aria-label="Toggle steps">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </>
        ) : (
          <button
            onClick={create}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Create sequence
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-danger">
          {error}
        </p>
      )}

      {seq && open && (
        <div className="space-y-3 border-t border-border p-4">
          {seq.steps.map((step, i) => (
            <StepEditor key={step.id} step={step} index={i} />
          ))}
          <AddStep sequenceId={seq.id} />
        </div>
      )}
    </div>
  )
}

function StepEditor({ step, index }: { step: StepRowData; index: number }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [designing, setDesigning] = useState(false)
  const [delay, setDelay] = useState(String(step.delayHours))
  const [subject, setSubject] = useState(step.subject)
  const [body, setBody] = useState(step.body)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const hasBlock = step.blockJson != null

  function save() {
    start(async () => {
      const r = await updateStep(step.id, { delayHours: Number(delay), subject, body, enabled: step.enabled })
      if ('error' in r) { setError(r.error); return }
      setEditing(false)
      router.refresh()
    })
  }
  function toggle() {
    setError(null)
    start(async () => {
      const r = await updateStep(step.id, { delayHours: step.delayHours, subject: step.subject, body: step.body, enabled: !step.enabled })
      if ('error' in r) { setError(r.error); return }
      router.refresh()
    })
  }
  function remove() {
    if (!confirm('Delete this step?')) return
    setError(null)
    start(async () => {
      const r = await deleteStep(step.id)
      if ('error' in r) { setError(r.error); return }
      router.refresh()
    })
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-canvas/40 p-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-subtle">Wait</label>
          <input value={delay} onChange={(e) => setDelay(e.target.value)} inputMode="numeric" className="w-20 rounded-md border border-border bg-canvas px-2 py-1 text-sm text-text" />
          <span className="text-xs text-subtle">hours, then send:</span>
        </div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={field} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Email body" className={`${field} resize-y`} />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={pending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">Save</button>
          <button onClick={() => { setEditing(false); setError(null) }} className="px-2 py-1.5 text-xs font-semibold text-muted hover:text-text">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className={`flex items-start gap-3 rounded-xl border border-border bg-canvas/40 p-3 ${step.enabled ? '' : 'opacity-60'}`}>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary-strong">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-2xs font-medium text-subtle">
            <Clock className="h-3 w-3" /> {humanDelay(step.delayHours)}
          </p>
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-text">{step.subject}</p>
            {hasBlock && <StatusChip tone="info" size="sm">Designed</StatusChip>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
            {hasBlock ? 'This step sends a block-designed email. Open the designer to edit it.' : step.body}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => setDesigning((d) => !d)} aria-pressed={designing} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs transition-colors ${designing ? 'border-primary text-primary-strong' : 'border-border text-muted hover:text-text'}`}>
            <LayoutTemplate className="h-3 w-3" /> Design
          </button>
          <button onClick={toggle} disabled={pending} className="rounded-md border border-border px-2 py-1 text-2xs text-muted hover:text-text disabled:opacity-60">{step.enabled ? 'Disable' : 'Enable'}</button>
          <button onClick={() => setEditing(true)} className="rounded-md border border-border px-2 py-1 text-2xs text-muted hover:text-text">Edit</button>
          <button onClick={remove} disabled={pending} className="rounded-md border border-border px-2 py-1 text-muted hover:text-danger disabled:opacity-60" aria-label="Delete step"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {designing && (
        <div className="rounded-xl border border-border bg-canvas/40 p-3">
          <StepBlockEditor
            key={`block-${step.id}`}
            stepId={step.id}
            subject={step.subject}
            initialLayout={step.blockJson ?? { rows: starterRows('email', 'basic') }}
          />
        </div>
      )}
    </div>
  )
}

function AddStep({ sequenceId }: { sequenceId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [delay, setDelay] = useState('24')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    start(async () => {
      const r = await addStep(sequenceId, { delayHours: Number(delay), subject, body })
      if ('error' in r) { setError(r.error); return }
      setOpen(false); setSubject(''); setBody(''); setDelay('24'); setError(null)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-text hover:border-border-strong">
        <Plus className="h-3.5 w-3.5" /> Add step
      </button>
    )
  }
  return (
    <div className="space-y-2 rounded-xl border border-border bg-canvas/40 p-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-subtle">Wait</label>
        <input value={delay} onChange={(e) => setDelay(e.target.value)} inputMode="numeric" className="w-20 rounded-md border border-border bg-canvas px-2 py-1 text-sm text-text" />
        <span className="text-xs text-subtle">hours after the previous step, then send:</span>
      </div>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={field} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Email body" className={`${field} resize-y`} />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={pending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">Add step</button>
        <button onClick={() => { setOpen(false); setError(null) }} className="px-2 py-1.5 text-xs font-semibold text-muted hover:text-text">Cancel</button>
      </div>
    </div>
  )
}
