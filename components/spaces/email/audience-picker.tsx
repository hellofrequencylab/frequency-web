'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, fieldClasses } from '@/components/ui/field'
import { countSpaceAudience } from '@/lib/spaces/campaigns-actions'
import { createSpaceSegment, deleteSpaceSegment } from '@/lib/spaces/segments-actions'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import { isError } from '@/lib/action-result'
import { cn } from '@/lib/utils'

// AUDIENCE PICKER (ENTITY-SPACES-BUILD §C Phase 3 + ADR-380). The owner picks who a campaign goes to:
// everyone in this Space, one tag, or a SAVED SEGMENT. A LIVE count updates as they pick
// (countSpaceAudience, gated on canEditProfile server-side). It is a controlled component: the parent
// holds the filter + count so the Send control can show the same number and pass the same filter to
// the send action (the count can never disagree with the send, because both resolve the same way).
//
// ADR-380 adds saved segments: a "Saved segments" optgroup in the same select (selecting one sets
// filter = { segmentId }), plus a small management row to SAVE the current filter as a named segment
// and DELETE a saved one. Both go through canEditProfile-gated server actions.
//
// Copy passes CONTENT-VOICE: plain, concrete, no narrated feelings, no em/en dashes.

export function AudiencePicker({
  spaceId,
  slug,
  tags,
  segments = [],
  filter,
  onFilterChange,
  onCountChange,
  disabled = false,
}: {
  spaceId: string
  /** The Space slug, for revalidating the surface after a segment save / delete. */
  slug: string
  /** The tags available to filter by (resolved server-side). Empty = only "everyone". */
  tags: string[]
  /** The saved segments for this Space (resolved server-side). Empty = no "Saved segments" group. */
  segments?: { id: string; name: string }[]
  filter: AudienceFilter
  onFilterChange: (filter: AudienceFilter) => void
  onCountChange?: (count: number) => void
  disabled?: boolean
}) {
  const router = useRouter()
  const [count, setCount] = useState<number | null>(null)
  const [pending, start] = useTransition()

  // Segment management state (save the current filter / delete a saved one).
  const [newName, setNewName] = useState('')
  const [savePending, startSave] = useTransition()
  const [manageError, setManageError] = useState<string | null>(null)

  // Re-resolve the live count whenever the filter changes (tag OR segment). The server action is the
  // source of truth (and the same resolver the send uses), so the number the owner sees is the number
  // who get the email.
  useEffect(() => {
    let cancelled = false
    start(async () => {
      const n = await countSpaceAudience(spaceId, filter)
      if (cancelled) return
      setCount(n)
      onCountChange?.(n)
    })
    return () => {
      cancelled = true
    }
    // onFilterChange/onCountChange are stable enough; we re-run on the filter's tag + segment only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, filter.tag, filter.segmentId])

  // The select's current value: a segment (segment:<id>), a tag (the tag string), or '' = everyone.
  const selectValue = filter.segmentId ? `segment:${filter.segmentId}` : (filter.tag ?? '')

  function handleSelect(value: string) {
    setManageError(null)
    if (value.startsWith('segment:')) {
      onFilterChange({ segmentId: value.slice('segment:'.length) })
    } else {
      onFilterChange({ tag: value || null })
    }
  }

  // Save the CURRENT filter as a named segment. A saved segment stores the resolved facets (tag);
  // a segmentId is dropped server-side (a segment never references another segment).
  function handleSaveSegment() {
    const name = newName.trim()
    if (!name || disabled || savePending) return
    setManageError(null)
    const definition: AudienceFilter = { tag: filter.tag ?? null }
    startSave(async () => {
      const res = await createSpaceSegment(spaceId, slug, name, definition)
      if (isError(res)) {
        setManageError(res.error)
        return
      }
      setNewName('')
      router.refresh()
    })
  }

  function handleDeleteSegment(id: string) {
    if (disabled || savePending) return
    setManageError(null)
    startSave(async () => {
      const res = await deleteSpaceSegment(spaceId, slug, id)
      if (isError(res)) {
        setManageError(res.error)
        return
      }
      // If the deleted segment was selected, fall back to everyone.
      if (filter.segmentId === id) onFilterChange({ tag: null })
      router.refresh()
    })
  }

  const selectedSegment = filter.segmentId
    ? segments.find((s) => s.id === filter.segmentId)
    : null

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-text">Audience</p>
        <p className="mt-0.5 text-xs text-muted">
          Pick who gets this. We send to your own contacts, never anyone else&rsquo;s.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Send to</span>
        <select
          value={selectValue}
          disabled={disabled}
          onChange={(e) => handleSelect(e.target.value)}
          className={cn(fieldClasses, 'max-w-xs')}
        >
          <option value="">Everyone in this space</option>
          {tags.length > 0 && (
            <optgroup label="By tag">
              {tags.map((t) => (
                <option key={t} value={t}>
                  Tagged {t}
                </option>
              ))}
            </optgroup>
          )}
          {segments.length > 0 && (
            <optgroup label="Saved segments">
              {segments.map((s) => (
                <option key={s.id} value={`segment:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <p className="inline-flex items-center gap-1.5 text-sm text-muted" role="status" aria-live="polite">
        <Users className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        {pending || count == null ? (
          <span>Counting&hellip;</span>
        ) : (
          <span>
            <span className="font-semibold text-text tabular-nums">{count.toLocaleString()}</span>{' '}
            {count === 1 ? 'person' : 'people'} will get this
          </span>
        )}
      </p>

      {/* Save the current filter as a reusable segment. Hidden in read-only (staff preview). */}
      {!disabled && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Save this as a segment</span>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name this audience"
                maxLength={80}
                className="max-w-xs"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSaveSegment}
              disabled={!newName.trim() || savePending}
            >
              <Save className="h-3.5 w-3.5" aria-hidden /> Save segment
            </Button>
          </div>

          {selectedSegment && (
            <button
              type="button"
              onClick={() => handleDeleteSegment(selectedSegment.id)}
              disabled={savePending}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete &ldquo;{selectedSegment.name}&rdquo;
            </button>
          )}

          {manageError && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
              {manageError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
