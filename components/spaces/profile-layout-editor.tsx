'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, Lock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import type { ProfileBlockId } from '@/lib/spaces/profile-blocks'
import { saveSpaceProfileLayout } from '@/app/(main)/spaces/[slug]/settings/profile/actions'

// PROFILE LAYOUT EDITOR (Epic 1.7, S3 block-picker, client). The operator arranges their space
// profile: reorder sections, toggle each on or off, and see which sections are LOCKED behind a feature
// that is not turned on yet. Mobile-first: a single vertical list of rows, each with an on/off toggle
// and keyboard-accessible up/down reorder buttons. Save is explicit (a Save button) via useTransition,
// so a mis-tap is never persisted. Persists through the owner/admin/editor-gated saveSpaceProfileLayout
// action; the server re-gates + re-validates, so this UI is convenience, not the authority.
//
// A LOCKED block (its required feature is off) renders greyed with a one-line reason + a link to the
// Features page, and is never arrangeable or saveable (it re-appears in the fresh default the moment
// the feature is turned on). Semantic DAWN tokens only, no hex, no fixed px type. No em dashes.

/** One arrangeable section row (its feature is on, or it needs none). */
export interface EditorBlock {
  id: ProfileBlockId
  label: string
  description: string
  shown: boolean
}

/** One locked section row: a block whose required feature is off. */
export interface LockedBlock {
  id: ProfileBlockId
  label: string
  description: string
  /** The human label of the feature that must be turned on (e.g. "Booking"). */
  featureLabel: string
}

export function ProfileLayoutEditor({
  spaceId,
  slug,
  blocks,
  locked,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  /** The arrangeable blocks, already in effective (saved-merged) order. */
  blocks: EditorBlock[]
  /** Blocks locked behind a feature that is off. */
  locked: LockedBlock[]
  /** Staff preview: render controls disabled (the write action stays gated server-side anyway). */
  readOnly?: boolean
}) {
  const [items, setItems] = useState<EditorBlock[]>(blocks)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function move(index: number, delta: -1 | 1) {
    const next = index + delta
    if (next < 0 || next >= items.length) return
    setItems((cur) => {
      const copy = [...cur]
      const [row] = copy.splice(index, 1)
      copy.splice(next, 0, row)
      return copy
    })
    setDirty(true)
    setSaved(false)
  }

  function toggle(id: ProfileBlockId, shown: boolean) {
    setItems((cur) => cur.map((r) => (r.id === id ? { ...r, shown } : r)))
    setDirty(true)
    setSaved(false)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        // `order` carries the full arranged sequence (shown + hidden) so a re-shown block keeps its
        // place; `hidden` carries the toggled-off ids the renderer drops.
        const layout = {
          order: items.map((r) => r.id),
          hidden: items.filter((r) => !r.shown).map((r) => r.id),
        }
        const res = await saveSpaceProfileLayout(spaceId, layout)
        if (isError(res)) throw new Error(res.error)
        setDirty(false)
        setSaved(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your layout.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <ol className="space-y-3">
        {items.map((row, index) => (
          <li
            key={row.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex flex-col gap-1">
              <button
                type="button"
                aria-label={`Move ${row.label} up`}
                disabled={readOnly || pending || index === 0}
                onClick={() => move(index, -1)}
                className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Move ${row.label} down`}
                disabled={readOnly || pending || index === items.length - 1}
                onClick={() => move(index, 1)}
                className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{row.label}</p>
              <p className="mt-0.5 text-xs text-muted">{row.description}</p>
            </div>

            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted">
              <input
                type="checkbox"
                aria-label={`Show ${row.label}`}
                checked={row.shown}
                disabled={readOnly || pending}
                onChange={(e) => toggle(row.id, e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-primary disabled:opacity-50"
              />
              On
            </label>
          </li>
        ))}
      </ol>

      {locked.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Needs a feature</p>
          {locked.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface-elevated p-4"
            >
              <Lock className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-muted">{row.label}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Turn on {row.featureLabel} in Features to add this section.
                </p>
              </div>
              <Link
                href={`/spaces/${slug}/settings/features`}
                className="shrink-0 text-xs font-semibold text-primary-strong hover:underline"
              >
                Features
              </Link>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={pending || !dirty}>
            {saved && !dirty ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> Saved
              </>
            ) : pending ? (
              'Saving...'
            ) : (
              'Save layout'
            )}
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/spaces/${slug}/profile-preview`}>Preview</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
