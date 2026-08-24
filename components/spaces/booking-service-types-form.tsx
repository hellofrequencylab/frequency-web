'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { isError } from '@/lib/action-result'
import { setSpaceServiceTypes } from '@/lib/spaces/booking-actions'
import type { ServiceType, ServiceTypeInput, BookingQuestion } from '@/lib/spaces/booking'
import { IconButton } from '@/components/ui/icon-button'

// OWNER SERVICE TYPES EDITOR (client, P1, ADR-605). The Practitioner defines the reusable bookable
// offerings members pick from ("30 minute intro", "60 minute session"): a name, a duration, and an
// optional description. Saved through the canEditProfile-gated setSpaceServiceTypes action, which
// preserves existing ids so any window bound to a service keeps its binding. The server re-validates
// and normalizes, so this form is convenience, not the gate.
//
// COPY: plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE §10). Tokens only.

const DURATIONS = [15, 30, 45, 60, 90, 120] as const

interface ServiceDraft {
  id: string | null
  name: string
  description: string
  durationMinutes: number
  questions: BookingQuestion[]
}

function toDrafts(services: ServiceType[]): ServiceDraft[] {
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    durationMinutes: s.durationMinutes,
    questions: s.questions,
  }))
}

let questionSeq = 0
function newQuestionId(): string {
  questionSeq += 1
  return `q_${Date.now().toString(36)}_${questionSeq}`
}

export function BookingServiceTypesForm({
  spaceId,
  initialServices,
}: {
  spaceId: string
  initialServices: ServiceType[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<ServiceDraft[]>(() => toDrafts(initialServices))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function update(index: number, patch: Partial<ServiceDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setSaved(false)
  }

  function addRow() {
    setRows((prev) => [...prev, { id: null, name: '', description: '', durationMinutes: 30, questions: [] }])
    setSaved(false)
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function addQuestion(serviceIndex: number) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === serviceIndex
          ? { ...r, questions: [...r.questions, { id: newQuestionId(), label: '', type: 'short', required: false }] }
          : r,
      ),
    )
    setSaved(false)
  }
  function updateQuestion(serviceIndex: number, qIndex: number, patch: Partial<BookingQuestion>) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === serviceIndex
          ? { ...r, questions: r.questions.map((q, j) => (j === qIndex ? { ...q, ...patch } : q)) }
          : r,
      ),
    )
    setSaved(false)
  }
  function removeQuestion(serviceIndex: number, qIndex: number) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === serviceIndex ? { ...r, questions: r.questions.filter((_, j) => j !== qIndex) } : r,
      ),
    )
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)

    const services: ServiceTypeInput[] = []
    for (const r of rows) {
      if (!r.name.trim()) {
        setError('Give every service a name, or remove the empty one.')
        return
      }
      services.push({
        id: r.id,
        name: r.name.trim(),
        description: r.description.trim() || null,
        durationMinutes: r.durationMinutes,
        active: true,
        sortOrder: services.length,
        questions: r.questions
          .map((q) => ({ ...q, label: q.label.trim() }))
          .filter((q) => q.label),
      })
    }

    startSave(async () => {
      const result = await setSpaceServiceTypes(spaceId, services)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-6 rounded-card border border-border bg-surface p-5 lift-1 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div className="space-y-3">
        {/* Heads the list of service rows. Not a <Label>: there is no single control under it,
            and each row's own fields are already labelled. */}
        <p className={`${labelClasses} font-semibold`}>Services</p>
        {rows.length === 0 && (
          <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-body-sm text-muted">
            No services yet. Add one so members know what they are booking.
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={r.id ?? `new-${i}`}
            className="space-y-3 rounded-card border border-border bg-surface-elevated/40 p-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="text-meta font-medium text-muted">Name</span>
                <Input
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="30 minute session"
                  maxLength={120}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-meta font-medium text-muted">Length</span>
                <Select
                  value={r.durationMinutes}
                  onChange={(e) => update(i, { durationMinutes: Number(e.target.value) })}
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </Select>
              </label>
              <IconButton
                variant="bordered"
                tone="danger"
                label="Remove this service"
                onClick={() => removeRow(i)}
                className="mb-1"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-meta font-medium text-muted">Description (optional)</span>
              <Textarea
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="What this session covers and who it is for."
                rows={2}
                maxLength={1000}
              />
            </label>

            {/* Booking questions (P3): asked when a member books this service. */}
            <div className="space-y-2 rounded-card border border-dashed border-border p-3">
              <span className="text-meta font-semibold text-muted">Booking questions (optional)</span>
              {r.questions.map((q, j) => (
                <div key={q.id} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Question ${j + 1}`}
                    value={q.label}
                    onChange={(e) => updateQuestion(i, j, { label: e.target.value })}
                    placeholder="What would you like to focus on?"
                    maxLength={200}
                    className="min-w-40 flex-1"
                  />
                  {/* aria-label added with the primitive: this select sat bare in the row with
                      no label of any kind. */}
                  <Select
                    aria-label="Answer length"
                    value={q.type}
                    onChange={(e) => updateQuestion(i, j, { type: e.target.value === 'long' ? 'long' : 'short' })}
                    wrapperClassName="inline-block w-max max-w-full"
                    options={[
                      { value: 'short', label: 'Short' },
                      { value: 'long', label: 'Long' },
                    ]}
                  />
                  <Checkbox
                    label="Required"
                    checked={q.required}
                    onChange={(e) => updateQuestion(i, j, { required: e.target.checked })}
                  />
                  <IconButton
                    variant="bordered"
                    tone="danger"
                    label="Remove this question"
                    onClick={() => removeQuestion(i, j)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </IconButton>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addQuestion(i)}
                className="inline-flex items-center gap-1.5 text-meta font-semibold text-primary-strong transition-colors hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add a question
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a service
        </button>
      </div>

      {error && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden /> Save services
            </>
          )}
        </Button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-body-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>
    </form>
  )
}
