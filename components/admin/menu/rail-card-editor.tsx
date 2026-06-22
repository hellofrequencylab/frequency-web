'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import type { MenuMode, ResolvedRailCard } from '@/lib/menus/types'
import { updateRailCard, deleteRailCard, type UpdateRailCardPatch } from '@/lib/menus/actions'
import { LinkTargetField } from './link-target-field'
import { RoleModeMatrix } from './role-mode-matrix'
import { MODE_LABEL, MODE_ORDER } from './known-routes'

// One featured rail card editor (requirement 10): title, body, href, cta, side, mode,
// and the per-role matrix. Like the "Find your first circle" card. Optimistic save +
// rollback, reports through onStatus.
export function RailCardEditor({
  card,
  onChanged,
  onDeleted,
  onStatus,
}: {
  card: ResolvedRailCard
  onChanged: (patch: Partial<ResolvedRailCard>) => void
  onDeleted: () => void
  onStatus: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [href, setHref] = useState(card.href)
  const [cta, setCta] = useState(card.cta ?? '')

  function save(patch: UpdateRailCardPatch, optimistic: Partial<ResolvedRailCard>) {
    const prev: Partial<ResolvedRailCard> = {}
    for (const k of Object.keys(optimistic) as (keyof ResolvedRailCard)[]) {
      ;(prev as Record<string, unknown>)[k] = card[k]
    }
    setError(null)
    onChanged(optimistic)
    onStatus('Saving rail card')
    startTransition(async () => {
      const res = await updateRailCard(card.id, patch)
      if (res.ok) onStatus('Rail card saved')
      else {
        onChanged(prev)
        setError(res.error)
        onStatus('Could not save rail card')
      }
    })
  }

  function remove() {
    if (!confirm(`Delete the rail card "${card.title}"? This cannot be undone.`)) return
    setError(null)
    onStatus('Deleting rail card')
    startTransition(async () => {
      const res = await deleteRailCard(card.id)
      if (res.ok) {
        onDeleted()
        onStatus('Rail card deleted')
      } else {
        setError(res.error)
        onStatus('Could not delete rail card')
      }
    })
  }

  return (
    <li className="rounded-xl border border-border bg-canvas/40">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
            {card.title || 'Untitled card'}
          </span>
        </button>
        <span className="shrink-0 rounded-full bg-surface-elevated px-1.5 py-0.5 text-xs font-semibold capitalize text-muted">
          {card.side}
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={isPending}
          aria-label={`Delete ${card.title}`}
          className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`ct-${card.id}`}>
                Title
              </label>
              <input
                id={`ct-${card.id}`}
                type="text"
                value={title}
                disabled={isPending}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title !== card.title && title && save({ title }, { title })}
                className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`cs-${card.id}`}>
                Side
              </label>
              <select
                id={`cs-${card.id}`}
                value={card.side}
                disabled={isPending}
                onChange={(e) =>
                  save(
                    { side: e.target.value as 'left' | 'right' },
                    { side: e.target.value as 'left' | 'right' },
                  )
                }
                className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`cb-${card.id}`}>
              Body
            </label>
            <textarea
              id={`cb-${card.id}`}
              value={body}
              rows={2}
              disabled={isPending}
              onChange={(e) => setBody(e.target.value)}
              onBlur={() => body !== card.body && body && save({ body }, { body })}
              className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <LinkTargetField value={href} disabled={isPending} onChange={setHref} id={`ch-${card.id}`} />
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`cc-${card.id}`}>
                Call to action
              </label>
              <input
                id={`cc-${card.id}`}
                type="text"
                value={cta}
                disabled={isPending}
                placeholder="Take a look"
                onChange={(e) => setCta(e.target.value)}
                onBlur={() =>
                  cta !== (card.cta ?? '') && save({ cta: cta || null }, { cta: cta || undefined })
                }
                className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              />
            </div>
          </div>
          {href !== card.href && href && !isPending && (
            <button
              type="button"
              onClick={() => save({ href }, { href })}
              className="text-xs font-semibold text-primary-strong hover:underline"
            >
              Save link target
            </button>
          )}

          <div className="min-w-0 sm:max-w-xs">
            <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`cm-${card.id}`}>
              Default mode
            </label>
            <select
              id={`cm-${card.id}`}
              value={card.mode}
              disabled={isPending}
              onChange={(e) => save({ mode: e.target.value as MenuMode }, { mode: e.target.value as MenuMode })}
              className="w-full rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {MODE_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          <RoleModeMatrix
            roleModes={card.roleModes}
            disabled={isPending}
            onChange={(next) => save({ roleModes: next }, { roleModes: next })}
          />
        </div>
      )}
    </li>
  )
}
