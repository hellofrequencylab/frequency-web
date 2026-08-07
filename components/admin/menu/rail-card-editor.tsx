'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { Select } from '@/components/ui/select'
import type { ResolvedRailCard } from '@/lib/menus/types'
import { updateRailCard, deleteRailCard, type UpdateRailCardPatch } from '@/lib/menus/actions'
import { LinkTargetField } from './link-target-field'
import { RoleModeMatrix } from './role-mode-matrix'
import { OnOffToggle } from './on-off-toggle'
import { Input, Textarea } from '@/components/ui/field'

// One featured rail card editor: title, body, href, cta, side, an on/off visibility
// toggle (the global show/hide, point 6), and the per-role matrix. Like the "Find your
// first circle" card. Optimistic save + rollback, reports through onStatus.
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
    <li className="rounded-card border border-border bg-canvas/40">
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
          <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text">
            {card.title || 'Untitled card'}
          </span>
        </button>
        <span className="shrink-0 rounded-pill bg-surface-elevated px-1.5 py-0.5 text-meta font-semibold capitalize text-muted">
          {card.side}
        </span>
        <OnOffToggle
          mode={card.mode}
          disabled={isPending}
          label={`Show ${card.title || 'this card'}`}
          onChange={(mode) => save({ mode }, { mode })}
        />
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
          {error && <p className="text-body-sm text-danger">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-meta font-semibold text-subtle" htmlFor={`ct-${card.id}`}>
                Title
              </label>
              <Input
                id={`ct-${card.id}`}
                type="text"
                value={title}
                disabled={isPending}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title !== card.title && title && save({ title }, { title })}
                className="!px-2.5 !py-1.5"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-meta font-semibold text-subtle" htmlFor={`cs-${card.id}`}>
                Side
              </label>
              <Select
                id={`cs-${card.id}`}
                value={card.side}
                disabled={isPending}
                onChange={(e) =>
                  save(
                    { side: e.target.value as 'left' | 'right' },
                    { side: e.target.value as 'left' | 'right' },
                  )
                }
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </div>
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-meta font-semibold text-subtle" htmlFor={`cb-${card.id}`}>
              Body
            </label>
            <Textarea
              id={`cb-${card.id}`}
              value={body}
              rows={2}
              disabled={isPending}
              onChange={(e) => setBody(e.target.value)}
              onBlur={() => body !== card.body && body && save({ body }, { body })}
              className="!px-2.5 !py-1.5"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <LinkTargetField value={href} disabled={isPending} onChange={setHref} id={`ch-${card.id}`} />
            <div className="min-w-0">
              <label className="mb-1 block text-meta font-semibold text-subtle" htmlFor={`cc-${card.id}`}>
                Call to action
              </label>
              <Input
                id={`cc-${card.id}`}
                type="text"
                value={cta}
                disabled={isPending}
                placeholder="Take a look"
                onChange={(e) => setCta(e.target.value)}
                onBlur={() =>
                  cta !== (card.cta ?? '') && save({ cta: cta || null }, { cta: cta || undefined })
                }
                className="!px-2.5 !py-1.5"
              />
            </div>
          </div>
          {href !== card.href && href && !isPending && (
            <button
              type="button"
              onClick={() => save({ href }, { href })}
              className="text-meta font-semibold text-primary-strong hover:underline"
            >
              Save link target
            </button>
          )}

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
