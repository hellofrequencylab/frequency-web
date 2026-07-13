'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setSpaceServiceTypes } from '@/lib/spaces/booking-actions'
import type { ServiceType, ServiceTypeInput, BookingQuestion } from '@/lib/spaces/booking'
import { cn } from '@/lib/utils'

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
      className="space-y-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div className="space-y-3">
        <Label className="font-semibold">Services</Label>
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
            No services yet. Add one so members know what they are booking.
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={r.id ?? `new-${i}`}
            className="space-y-3 rounded-lg border border-border bg-surface-elevated/40 p-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-muted">Name</span>
                <Input
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="30 minute session"
                  maxLength={120}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Length</span>
                <select
                  value={r.durationMinutes}
                  onChange={(e) => update(i, { durationMinutes: Number(e.target.value) })}
                  className={cn(fieldClasses, 'w-32')}
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Remove this service"
                className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Description (optional)</span>
              <Textarea
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="What this session covers and who it is for."
                rows={2}
                maxLength={1000}
              />
            </label>

            {/* Booking questions (P3): asked when a member books this service. */}
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <span className="text-xs font-semibold text-muted">Booking questions (optional)</span>
              {r.questions.map((q, j) => (
                <div key={q.id} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={q.label}
                    onChange={(e) => updateQuestion(i, j, { label: e.target.value })}
                    placeholder="What would you like to focus on?"
                    maxLength={200}
                    className="min-w-40 flex-1"
                  />
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(i, j, { type: e.target.value === 'long' ? 'long' : 'short' })}
                    className={cn(fieldClasses, 'w-28')}
                  >
                    <option value="short">Short</option>
                    <option value="long">Long</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) => updateQuestion(i, j, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => removeQuestion(i, j)}
                    aria-label="Remove this question"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addQuestion(i)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-strong transition-colors hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add a question
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a service
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
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
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>
    </form>
  )
}
