'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Field, Input, Textarea, labelClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { CURRICULUM_LIMITS, type TrainingStep } from '@/lib/onboarding/training-curriculum'
import { saveTrainingTier, resetTrainingTier } from './actions'

// One tier's in-place editor on /admin/content/training (LIVE-690). Edits the title, intro and
// ordered steps; the reward stays in code. Existing steps keep their ids through a relabel or a
// move, so members keep the progress they already have; a new step gets an id on save.

interface Draft {
  title: string
  blurb: string
  steps: TrainingStep[]
}

export function TierEditor({ role, initial, edited }: { role: string; initial: Draft; edited: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(initial)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const setStep = (i: number, patch: Partial<TrainingStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const steps = [...d.steps]
      const j = i + by
      if (j < 0 || j >= steps.length) return d
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...d, steps }
    })
  const remove = (i: number) => setDraft((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))
  const add = () => setDraft((d) => ({ ...d, steps: [...d.steps, { id: '', label: '', href: '/help/' }] }))

  function run(fn: () => Promise<{ data: void } | { error: string }>, done: string) {
    setMessage(null)
    start(async () => {
      const r = await fn()
      if (isError(r)) {
        setMessage({ tone: 'error', text: r.error })
        return
      }
      setMessage({ tone: 'ok', text: done })
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => { setDraft(initial); setOpen(true) }}>
          Edit this path
        </Button>
        {edited && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => resetTrainingTier(role), 'Back to the default path.')}
          >
            Reset to default
          </Button>
        )}
        {message && (
          <p className={`text-meta font-medium ${message.tone === 'error' ? 'text-danger' : 'text-muted'}`} aria-live="polite">
            {message.text}
          </p>
        )}
      </div>
    )
  }

  const headingId = `steps-${role}`
  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-4">
      <Field label="Title">
        <Input
          value={draft.title}
          maxLength={CURRICULUM_LIMITS.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
      </Field>
      <Field label="Intro" hint="What this rung just unlocked, in a sentence or two.">
        <Textarea
          rows={3}
          value={draft.blurb}
          maxLength={CURRICULUM_LIMITS.blurb}
          onChange={(e) => setDraft((d) => ({ ...d, blurb: e.target.value }))}
        />
      </Field>

      <div role="group" aria-labelledby={headingId} className="space-y-2">
        <p id={headingId} className={labelClasses}>
          Steps ({draft.steps.length} of {CURRICULUM_LIMITS.maxSteps})
        </p>
        <ol className="space-y-2">
          {draft.steps.map((s, i) => (
            <li key={`${s.id}-${i}`} className="flex flex-col gap-2 rounded-card border border-border/60 p-3 sm:flex-row sm:items-end">
              <Field label={`Step ${i + 1}`} className="min-w-0 flex-1">
                <Input value={s.label} maxLength={CURRICULUM_LIMITS.label} onChange={(e) => setStep(i, { label: e.target.value })} />
              </Field>
              <Field label="Link" className="min-w-0 flex-1">
                <Input value={s.href} maxLength={CURRICULUM_LIMITS.href} onChange={(e) => setStep(i, { href: e.target.value })} />
              </Field>
              <div className="flex gap-1">
                <IconButton label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label={`Move step ${i + 1} down`} disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label={`Remove step ${i + 1}`} tone="danger" disabled={draft.steps.length <= 1} onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
        {draft.steps.length < CURRICULUM_LIMITS.maxSteps && (
          <Button variant="ghost" size="sm" onClick={add}>
            <Plus className="h-4 w-4" aria-hidden />
            Add a step
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" loading={pending} onClick={() => run(() => saveTrainingTier(role, draft), 'Saved. Members see it now.')}>
          Save path
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setOpen(false); setMessage(null) }}>
          Cancel
        </Button>
        {message && (
          <p className={`text-meta font-medium ${message.tone === 'error' ? 'text-danger' : 'text-muted'}`} aria-live="polite">
            {message.text}
          </p>
        )}
      </div>
    </div>
  )
}
