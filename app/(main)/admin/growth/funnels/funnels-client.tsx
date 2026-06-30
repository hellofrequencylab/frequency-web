'use client'

// Funnel list + create + template gallery for the Growth OS funnel builder (GE2-3,
// GE2-4, ADR-455). The page passes presentation-ready view-models; this client only
// renders + dispatches the gated actions, then refreshes. Strings are CONTENT-VOICE
// (plain, no em dashes); semantic tokens only.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, Sparkles } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { PERSONA_ORDER } from '@/lib/onboarding/personas'
import { createFunnel, createFunnelFromTemplate } from './actions'

const STATUS_TONE: Record<string, StatusTone> = { active: 'success', draft: 'neutral', archived: 'neutral' }

export interface FunnelListItem {
  id: string
  name: string
  status: string
  persona: string | null
  goalEvent: string
  stageCount: number
  linkCount: number
}

export interface TemplateCard {
  key: string
  label: string
  blurb: string
  persona: string
  goalEvent: string
}

export function FunnelsManager({
  funnels,
  templates,
}: {
  funnels: FunnelListItem[]
  templates: TemplateCard[]
}) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-8">
      {/* Templates (GE2-4) — clone a per-persona starting point. */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-text">
            <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden /> Start from a template
          </h3>
          {!creating && (
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> Blank funnel
            </Button>
          )}
        </div>

        {creating && (
          <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
            <CreateForm onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
          {templates.map((t) => (
            <TemplateTile key={t.key} template={t} />
          ))}
        </div>
      </section>

      {/* The funnel list. */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-text">All funnels</h3>
        {funnels.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="No funnels yet."
            description="Clone a template above or start a blank funnel, then wire its stages."
          />
        ) : (
          funnels.map((f) => <FunnelRow key={f.id} funnel={f} />)
        )}
      </section>
    </div>
  )
}

function TemplateTile({ template }: { template: TemplateCard }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function clone() {
    setErr(null)
    start(async () => {
      const res = await createFunnelFromTemplate(template.key)
      if (isError(res)) {
        setErr(res.error)
        return
      }
      router.push(`/admin/growth/funnels/${res.data.id}`)
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{template.label}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted">{template.blurb}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs uppercase tracking-wide text-subtle">
          Goal: <span className="text-text">{template.goalEvent}</span>
        </span>
        <Button size="sm" onClick={clone} disabled={pending}>
          {pending ? 'Creating…' : 'Use template'}
        </Button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  )
}

function FunnelRow({ funnel }: { funnel: FunnelListItem }) {
  return (
    <Link
      href={`/admin/growth/funnels/${funnel.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-bold text-text">{funnel.name}</h4>
          <StatusChip tone={STATUS_TONE[funnel.status] ?? 'neutral'} size="sm">
            <span className="capitalize">{funnel.status}</span>
          </StatusChip>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {funnel.persona && <span className="capitalize">{funnel.persona} · </span>}
          Goal <span className="font-semibold text-text">{funnel.goalEvent}</span> ·{' '}
          <span className="font-semibold text-text">{funnel.stageCount}</span> stage{funnel.stageCount === 1 ? '' : 's'} ·{' '}
          <span className="font-semibold text-text">{funnel.linkCount}</span> link{funnel.linkCount === 1 ? '' : 's'}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
    </Link>
  )
}

function CreateForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [persona, setPersona] = useState('')
  const [goalEvent, setGoalEvent] = useState('signup')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  function submit() {
    setErr(null)
    start(async () => {
      const res = await createFunnel({
        name,
        description: description || undefined,
        persona: persona || null,
        goalEvent,
      })
      if (isError(res)) {
        setErr(res.error)
        return
      }
      onDone()
      router.push(`/admin/growth/funnels/${res.data.id}`)
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="funnel-name">Name</Label>
        <Input
          id="funnel-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Builder recruitment, Spring"
          maxLength={120}
        />
      </div>
      <div>
        <Label htmlFor="funnel-desc">Description</Label>
        <Textarea
          id="funnel-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this funnel is for, in a line."
          rows={2}
          maxLength={400}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="funnel-persona">Persona</Label>
          <select
            id="funnel-persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className={fieldClasses}
          >
            <option value="">Any persona</option>
            {PERSONA_ORDER.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="funnel-goal">Goal event</Label>
          <Input
            id="funnel-goal"
            value={goalEvent}
            onChange={(e) => setGoalEvent(e.target.value)}
            placeholder="signup"
            maxLength={80}
          />
        </div>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !name.trim()}>
          {pending ? 'Creating…' : 'Create funnel'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
