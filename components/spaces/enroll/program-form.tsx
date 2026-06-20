'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setSpaceProgram } from '@/lib/spaces/enroll-actions'
import type { SpaceProgram } from '@/lib/spaces/enroll'
import { cn } from '@/lib/utils'

// OWNER PROGRAM EDITOR (client). The Coaching owner defines ONE program (name, description, schedule
// text, start/end dates, capacity, published), saved through the canEditProfile-gated setSpaceProgram
// action. The server re-validates + normalizes, so this form is convenience, not the gate.
//
// HONESTY (CONTENT-VOICE skeptic test): there is no price field, because v1 takes no payment. The
// footer says enrolling reserves a seat and paid enrollment comes later. Plain labels, no narrated
// feelings, no em or en dashes (CONTENT-VOICE §10).

/** The editor's draft state (capacity as a STRING for the input; empty = no cap). */
interface ProgramDraft {
  name: string
  description: string
  schedule: string
  startsOn: string
  endsOn: string
  capacity: string
  isPublished: boolean
}

/** Map a saved program back to an editable draft (or a blank draft for a brand-new program). */
function toDraft(program: SpaceProgram | null): ProgramDraft {
  if (!program) {
    return {
      name: '',
      description: '',
      schedule: '',
      startsOn: '',
      endsOn: '',
      capacity: '',
      isPublished: true,
    }
  }
  return {
    name: program.name,
    description: program.description ?? '',
    schedule: program.schedule ?? '',
    startsOn: program.startsOn ?? '',
    endsOn: program.endsOn ?? '',
    capacity: program.capacity > 0 ? String(program.capacity) : '',
    isPublished: program.isPublished,
  }
}

/** Capacity string to a non-negative integer, or null if malformed. Empty reads as 0 (no cap). */
function capacityToNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return 0
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function ProgramForm({
  spaceId,
  slug,
  initialProgram,
}: {
  spaceId: string
  slug: string
  initialProgram: SpaceProgram | null
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<ProgramDraft>(() => toDraft(initialProgram))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function update(patch: Partial<ProgramDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)

    const name = draft.name.trim()
    if (!name) {
      setError('Give your program a name.')
      return
    }
    const capacity = capacityToNumber(draft.capacity)
    if (capacity == null) {
      setError('Use a whole number for capacity, or leave it blank for no limit.')
      return
    }
    if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) {
      setError('The end date cannot come before the start date.')
      return
    }

    startSave(async () => {
      const result = await setSpaceProgram(spaceId, {
        name,
        description: draft.description.trim() || null,
        schedule: draft.schedule.trim() || null,
        startsOn: draft.startsOn || null,
        endsOn: draft.endsOn || null,
        capacity,
        isPublished: draft.isPublished,
      })
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
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) save()
      }}
    >
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div>
          <Label htmlFor="program-name" className="font-semibold">
            Name
          </Label>
          <Input
            id="program-name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Spring coaching cohort"
            maxLength={120}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="program-description" className="font-semibold">
            Description (optional)
          </Label>
          <Textarea
            id="program-description"
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What members will work on, and who it is for."
            rows={4}
            maxLength={2000}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="program-schedule" className="font-semibold">
            Schedule (optional)
          </Label>
          <Input
            id="program-schedule"
            value={draft.schedule}
            onChange={(e) => update({ schedule: e.target.value })}
            placeholder="Tuesdays at 6pm, eight weeks"
            maxLength={500}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-subtle">Plain text for now. A full calendar comes later.</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Start date (optional)</span>
            <input
              type="date"
              value={draft.startsOn}
              onChange={(e) => update({ startsOn: e.target.value })}
              className={cn(fieldClasses, 'w-48')}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">End date (optional)</span>
            <input
              type="date"
              value={draft.endsOn}
              onChange={(e) => update({ endsOn: e.target.value })}
              className={cn(fieldClasses, 'w-48')}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Capacity (optional)</span>
            <input
              inputMode="numeric"
              value={draft.capacity}
              onChange={(e) => update({ capacity: e.target.value })}
              placeholder="No limit"
              className={cn(fieldClasses, 'w-40')}
            />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.isPublished}
            onChange={(e) => update({ isPublished: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
          />
          <span className="text-sm text-muted">Open for enrollment (members can enroll)</span>
        </label>
      </div>

      <p className="text-xs text-subtle">
        Enrolling reserves a seat. We do not take a payment when someone enrolls yet, so paid
        enrollment is coming later.
      </p>

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
              <Check className="h-4 w-4" aria-hidden /> Save program
            </>
          )}
        </Button>
        {saved && !pending && (
          <span
            className="inline-flex items-center gap-1 text-sm font-medium text-success"
            role="status"
          >
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/spaces/${slug}`)}
          disabled={pending}
        >
          View space
        </Button>
      </div>
    </form>
  )
}
