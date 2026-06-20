'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { setTicketTiers } from '@/lib/spaces/tickets-actions'
import type { TicketKind, TicketTier } from '@/lib/spaces/tickets'
import { cn } from '@/lib/utils'

// OWNER TICKET TIER EDITOR (client). The Event Space owner defines one or more ticket tiers (name,
// kind free/rsvp, capacity, description, active), saved through the canEditProfile-gated setTicketTiers
// action as a replace-set. The server re-validates + normalizes, so this form is convenience, not the
// gate.
//
// NO MONEY (CONTENT-VOICE skeptic test): there is no price field. A tier is either FREE (open entry,
// no reservation) or RSVP (a member reserves a spot, capacity-limited). The editor says plainly that
// no payment is taken yet. Plain labels, no narrated feelings, no em/en dashes (CONTENT-VOICE §10).

const KINDS: { value: TicketKind; label: string }[] = [
  { value: 'free', label: 'Free entry' },
  { value: 'rsvp', label: 'RSVP (reserve a spot)' },
]

/** A row in the editor (capacity as a STRING for the input; empty = unlimited). */
interface TierDraft {
  id?: string
  name: string
  kind: TicketKind
  capacity: string // empty = unlimited; otherwise a non-negative whole number
  description: string
  isActive: boolean
}

/** Capacity string to integer (or null = unlimited), or undefined if malformed. Empty reads as null. */
function parseCapacity(capacity: string): number | null | undefined {
  const trimmed = capacity.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Map saved tiers back to editable drafts (for the initial form state). */
function toDrafts(tiers: TicketTier[]): TierDraft[] {
  return tiers.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    capacity: t.capacity == null ? '' : String(t.capacity),
    description: t.description ?? '',
    isActive: t.isActive,
  }))
}

function emptyDraft(): TierDraft {
  return { name: '', kind: 'free', capacity: '', description: '', isActive: true }
}

export function TicketTierForm({
  spaceId,
  slug,
  initialTiers,
}: {
  spaceId: string
  slug: string
  initialTiers: TicketTier[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<TierDraft[]>(() =>
    initialTiers.length > 0 ? toDrafts(initialTiers) : [emptyDraft()],
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  function update(index: number, patch: Partial<TierDraft>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setSaved(false)
  }

  function addRow() {
    setRows((prev) => [...prev, emptyDraft()])
    setSaved(false)
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  function move(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)

    // Convert + client-validate. The server is authoritative, but a clear inline message helps.
    const tiers: TicketTier[] = []
    for (const r of rows) {
      const name = r.name.trim()
      if (!name) {
        setError('Give every tier a name.')
        return
      }
      const capacity = parseCapacity(r.capacity)
      if (capacity === undefined) {
        setError('Use a whole number for capacity (or leave it blank for unlimited).')
        return
      }
      tiers.push({
        id: r.id,
        name,
        kind: r.kind,
        capacity,
        description: r.description.trim() || null,
        sort: tiers.length,
        isActive: r.isActive,
      })
    }

    startSave(async () => {
      const result = await setTicketTiers(spaceId, tiers)
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
      <div className="space-y-4">
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
            No tiers yet. Add one to open tickets.
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={i}
            className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-subtle">Tier {i + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move tier up"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label="Move tier down"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-40"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  aria-label="Remove this tier"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor={`tier-name-${i}`} className="font-semibold">
                Name
              </Label>
              <Input
                id={`tier-name-${i}`}
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="General admission"
                maxLength={80}
                className="mt-1"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Ticket type</span>
                <select
                  value={r.kind}
                  onChange={(e) => update(i, { kind: e.target.value as TicketKind })}
                  className={cn(fieldClasses, 'w-56')}
                >
                  {KINDS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Capacity</span>
                <input
                  inputMode="numeric"
                  value={r.capacity}
                  onChange={(e) => update(i, { capacity: e.target.value })}
                  placeholder="Unlimited"
                  className={cn(fieldClasses, 'w-32')}
                />
              </label>
              <label className="flex flex-col justify-end gap-1">
                <span className="text-xs font-medium text-muted">Active</span>
                <span className="flex h-[38px] items-center gap-2">
                  <input
                    type="checkbox"
                    checked={r.isActive}
                    onChange={(e) => update(i, { isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
                  />
                  <span className="text-sm text-muted">Show to members</span>
                </span>
              </label>
            </div>

            <div>
              <Label htmlFor={`tier-desc-${i}`} className="font-semibold">
                Description (optional)
              </Label>
              <Textarea
                id={`tier-desc-${i}`}
                value={r.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="What this ticket is for, in a line or two."
                rows={2}
                maxLength={500}
                className="mt-1"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a tier
        </button>
      </div>

      <p className="text-xs text-subtle">
        Tickets are free or RSVP only for now. We do not take a payment, so paid ticketing is coming
        later. An RSVP reserves a spot up to the tier capacity.
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
              <Check className="h-4 w-4" aria-hidden /> Save tiers
            </>
          )}
        </Button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success" role="status">
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
