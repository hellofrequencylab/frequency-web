'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Loader2, Plus, Trash2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input, Label, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import type { SpaceDripSequence } from '@/lib/spaces/automation'
import {
  createSpaceSequence,
  addSequenceStep,
  deleteSequenceStep,
  setSpaceSequenceEnabled,
  deleteSpaceSequence,
} from '@/lib/spaces/automation-actions'
import { AudienceSelect, audienceLabel } from './audience-select'

// SEQUENCES PANEL (R5). Create ordered drip sequences (a named series of timed email steps to a chosen
// audience) and manage their steps. Client component over the server-fetched sequences; every mutation
// calls a gated server action then refreshes. A staff preview is read-only. No em/en dashes.

function delayLabel(hours: number): string {
  if (hours === 0) return 'right away'
  if (hours % 24 === 0) {
    const days = hours / 24
    return days === 1 ? 'after 1 day' : `after ${days} days`
  }
  return hours === 1 ? 'after 1 hour' : `after ${hours} hours`
}

export function SequencesPanel({
  spaceId,
  slug,
  sequences,
  tags,
  segments,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  sequences: SpaceDripSequence[]
  tags: string[]
  segments: { id: string; name: string }[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // New-sequence form.
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [audience, setAudience] = useState<AudienceFilter>({})

  function onCreateSequence() {
    if (readOnly || pending) return
    setError(null)
    start(async () => {
      const res = await createSpaceSequence(spaceId, slug, { name, audience })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setName('')
      setAudience({})
      setShowForm(false)
      router.refresh()
    })
  }

  function onToggle(id: string, enabled: boolean) {
    if (readOnly || pending) return
    start(async () => {
      const res = await setSpaceSequenceEnabled(spaceId, slug, id, enabled)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  function onDeleteSequence(id: string) {
    if (readOnly || pending) return
    start(async () => {
      const res = await deleteSpaceSequence(spaceId, slug, id)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {sequences.length === 0 && !showForm ? (
        <EmptyState
          icon={Layers}
          title="No sequences yet."
          description="Create a sequence, then add timed steps to drip a series of emails to your contacts."
        />
      ) : (
        <ul className="space-y-4">
          {sequences.map((seq) => (
            <li
              key={seq.id}
              className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{seq.name}</p>
                  <p className="truncate text-xs text-muted">
                    To {audienceLabel(seq.audience, segments)} · {seq.steps.length}{' '}
                    {seq.steps.length === 1 ? 'step' : 'steps'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={seq.enabled}
                    onCheckedChange={(v) => onToggle(seq.id, v)}
                    disabled={readOnly || pending}
                    aria-label={seq.enabled ? 'Turn sequence off' : 'Turn sequence on'}
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onDeleteSequence(seq.id)}
                      disabled={pending}
                      className="text-muted transition-colors hover:text-danger disabled:opacity-50"
                      aria-label="Delete sequence"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <StepList
                spaceId={spaceId}
                slug={slug}
                sequence={seq}
                readOnly={readOnly}
                pending={pending}
                start={start}
                setError={setError}
              />
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {!readOnly &&
        (showForm ? (
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="space-y-1">
              <Label htmlFor="seq-name">Sequence name</Label>
              <Input
                id="seq-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New member welcome"
              />
            </div>
            <AudienceSelect
              id="seq-audience"
              label="Send to"
              filter={audience}
              tags={tags}
              segments={segments}
              onChange={setAudience}
              disabled={pending}
            />
            <div className="flex items-center gap-2">
              <Button onClick={onCreateSequence} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create sequence'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false)
                  setName('')
                  setAudience({})
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add a sequence
          </Button>
        ))}
    </div>
  )
}

// The steps of one sequence, with an inline "add step" form. Its own component so each sequence keeps
// its own draft-step state.
function StepList({
  spaceId,
  slug,
  sequence,
  readOnly,
  pending,
  start,
  setError,
}: {
  spaceId: string
  slug: string
  sequence: SpaceDripSequence
  readOnly: boolean
  pending: boolean
  start: (cb: () => void) => void
  setError: (e: string | null) => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [delayHours, setDelayHours] = useState(24)

  function onAddStep() {
    if (readOnly || pending) return
    setError(null)
    start(async () => {
      const res = await addSequenceStep(spaceId, slug, sequence.id, {
        subject,
        body,
        delayHours,
      })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSubject('')
      setBody('')
      setDelayHours(24)
      setAdding(false)
      router.refresh()
    })
  }

  function onDeleteStep(stepId: string) {
    if (readOnly || pending) return
    start(async () => {
      const res = await deleteSequenceStep(spaceId, slug, stepId)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      {sequence.steps.length > 0 && (
        <ol className="space-y-1">
          {sequence.steps.map((step, i) => (
            <li
              key={step.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated/50 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted">
                  {i + 1}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Clock className="h-3 w-3" /> {delayLabel(step.delayHours)}
                </span>
                <span className="truncate text-text">{step.subject}</span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDeleteStep(step.id)}
                  disabled={pending}
                  className="shrink-0 text-muted transition-colors hover:text-danger disabled:opacity-50"
                  aria-label="Delete step"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {!readOnly &&
        (adding ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface-elevated/30 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`step-delay-${sequence.id}`}>Wait (hours)</Label>
                <Input
                  id={`step-delay-${sequence.id}`}
                  type="number"
                  min={0}
                  value={delayHours}
                  onChange={(e) => setDelayHours(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`step-subject-${sequence.id}`}>Subject</Label>
                <Input
                  id={`step-subject-${sequence.id}`}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your first week"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`step-body-${sequence.id}`}>Message</Label>
              <Textarea
                id={`step-body-${sequence.id}`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Write this step. Blank lines become paragraphs."
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onAddStep} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add step'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text"
          >
            <Plus className="h-3.5 w-3.5" /> Add step
          </button>
        ))}
    </div>
  )
}
