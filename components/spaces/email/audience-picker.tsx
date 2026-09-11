'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Save, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { countSpaceAudience } from '@/lib/spaces/campaigns-actions'
import { createSpaceSegment, updateSpaceSegment, deleteSpaceSegment } from '@/lib/spaces/segments-actions'
import type { AudienceFilter } from '@/lib/spaces/audiences'
import { isError } from '@/lib/action-result'

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
// 2026-09-05 (scan2 L9-08): the same management row is now the EDIT row when a saved segment is
// selected: it shows the segment's name, and Save name calls updateSpaceSegment (the definition is
// kept server-side). One component, two modes, so a mistyped name is a rename, not a delete + recreate.
//
// LIVE-293 adds MEMBER SEGMENTS to the same select: all space members, one membership tier, one of the
// Space's circles, or one event's RSVPs. This is the one thing the retired Space Message center could do
// that Email could not, and it is the whole reason the retirement is a port rather than a delete. A
// member segment is one more filter key (`memberSegment`); the pairing to this Space's own contacts
// happens server-side, BY EMAIL ADDRESS, and the send is pinned to the Marketing topic there too. The
// locked Topic row in the composer only REPORTS that pin; the resolver is what enforces it.
//
// Copy passes CONTENT-VOICE: plain, concrete, no narrated feelings, no em/en dashes.

export function AudiencePicker({
  spaceId,
  slug,
  tags,
  segments = [],
  memberSegments = [],
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
  /** MEMBER SEGMENTS (LIVE-293): the Space's members, paid tiers, circles, and upcoming events' RSVPs,
   *  resolved server-side by lib/spaces/broadcast-audience.ts. Empty = no member group in the select. */
  memberSegments?: { key: string; label: string }[]
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
  // Edit mode (scan2 L9-08): a rename draft keyed to the segment it was typed for. Deriving the field
  // value from (draft, selection) means a new selection shows its own name with no effect and no reset.
  const [editDraft, setEditDraft] = useState<{ id: string; name: string } | null>(null)

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
    // onFilterChange/onCountChange are stable enough; we re-run on the filter's own facets only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, filter.tag, filter.segmentId, filter.memberSegment])

  // The select's current value: a member segment (member:<key>), a saved segment (segment:<id>), a tag
  // (the tag string), or '' = everyone. The three are mutually exclusive by construction, because each
  // branch below replaces the whole filter rather than merging into it.
  const selectValue = filter.memberSegment
    ? `member:${filter.memberSegment}`
    : filter.segmentId
      ? `segment:${filter.segmentId}`
      : (filter.tag ?? '')

  function handleSelect(value: string) {
    setManageError(null)
    if (value.startsWith('member:')) {
      onFilterChange({ memberSegment: value.slice('member:'.length) })
    } else if (value.startsWith('segment:')) {
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

  const editName =
    selectedSegment && editDraft?.id === selectedSegment.id ? editDraft.name : (selectedSegment?.name ?? '')

  function handleRenameSegment() {
    if (!selectedSegment || disabled || savePending) return
    const name = editName.trim()
    if (!name || name === selectedSegment.name) return
    setManageError(null)
    startSave(async () => {
      const res = await updateSpaceSegment(spaceId, slug, selectedSegment.id, name)
      if (isError(res)) {
        setManageError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-5 lift-1">
      <div>
        <p className="text-body-sm font-semibold text-text">Audience</p>
        <p className="mt-0.5 text-meta text-muted">
          Pick who gets this. We send to your own contacts, never anyone else&rsquo;s.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-meta font-medium text-muted">Send to</span>
        <Select
          value={selectValue}
          disabled={disabled}
          onChange={(e) => handleSelect(e.target.value)}
          emptyLabel="Everyone in this space"
          wrapperClassName="max-w-xs"
        >
          {tags.length > 0 && (
            <optgroup label="By tag">
              {tags.map((t) => (
                <option key={t} value={t}>
                  Tagged {t}
                </option>
              ))}
            </optgroup>
          )}
          {memberSegments.length > 0 && (
            <optgroup label="Members, Circles, and events">
              {memberSegments.map((m) => (
                <option key={m.key} value={`member:${m.key}`}>
                  {m.label}
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
        </Select>
      </label>

      <p className="inline-flex items-center gap-1.5 text-body-sm text-muted" role="status" aria-live="polite">
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

      {/* A member audience says out loud what the resolver will do to it (LIVE-293): only the members
          this Space already holds a contact for are emailable, and the send rides Marketing. */}
      {filter.memberSegment && (
        <p className="text-meta text-muted">
          We email the people in this group who are already contacts of this space, with an email on
          file. This send goes out as Marketing, the strictest consent bar, so anyone who muted it is
          skipped.
        </p>
      )}

      {/* Save the current filter as a reusable segment. Hidden in read-only (staff preview), and hidden
          for a member audience: a saved segment stores tags, so saving one here would quietly keep a
          different audience than the one on screen. */}
      {/* 2026-09-05 (scan2 L9-08): with a saved segment selected, this row edits that segment instead. */}
      {!disabled && !filter.memberSegment && (
        <div className="space-y-2 border-t border-border pt-3">
          {selectedSegment ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-meta font-medium text-muted">Rename this segment</span>
                <Input
                  value={editName}
                  onChange={(e) => setEditDraft({ id: selectedSegment.id, name: e.target.value })}
                  placeholder="Name this audience"
                  maxLength={80}
                  className="max-w-xs"
                  aria-label="Segment name"
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRenameSegment}
                disabled={!editName.trim() || editName.trim() === selectedSegment.name || savePending}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Save name
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-meta font-medium text-muted">Save this as a segment</span>
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
          )}

          {selectedSegment && (
            <button
              type="button"
              onClick={() => handleDeleteSegment(selectedSegment.id)}
              disabled={savePending}
              className="inline-flex items-center gap-1.5 text-meta font-medium text-muted hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete &ldquo;{selectedSegment.name}&rdquo;
            </button>
          )}

          {manageError && (
            <p className="rounded-card bg-danger-bg px-3 py-2 text-body-sm font-medium text-danger" role="alert">
              {manageError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
