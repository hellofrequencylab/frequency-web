'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setSpaceServiceTypes } from '@/lib/spaces/booking-actions'
import type { ServiceType, ServiceTypeInput } from '@/lib/spaces/booking'
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
}

function toDrafts(services: ServiceType[]): ServiceDraft[] {
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    durationMinutes: s.durationMinutes,
  }))
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
    setRows((prev) => [...prev, { id: null, name: '', description: '', durationMinutes: 30 }])
    setSaved(false)
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
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
