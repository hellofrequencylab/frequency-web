'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { loadEventRevenueSplits, setEventRevenueSplits } from '@/app/(main)/events/split-actions'
import { isError } from '@/lib/action-result'
import { Input, labelClasses } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import type { EventRevenueSplitView } from '@/lib/events/revenue-splits-store'

// REVENUE SHARES (LIVE-767). The home Space OWNER gives each accepted Collaborator a share of every
// ticket, in whole percent. Renders nothing for anyone else (the action answers canSet: false), and
// nothing until there is at least one accepted Collaborator to share with: the field sits right under
// the Collaborators field, so the empty case needs no sentence of its own. A Collaborator whose
// payouts are not ready is shown with the reason and cannot take a share; the save refuses it too.

const MAX_TOTAL_PERCENT = 95

export function EventRevenueSplitField({ eventId, slug }: { eventId: string; slug: string }) {
  const [state, setState] = useState<{ canSet: boolean; rows: EventRevenueSplitView[] } | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const reload = useCallback(() => {
    loadEventRevenueSplits(eventId)
      .then((v) => {
        setState(v)
        setDraft(Object.fromEntries(v.rows.map((r) => [r.spaceId, String(Math.round(r.bps / 100))])))
      })
      .catch(() => setState({ canSet: false, rows: [] }))
  }, [eventId])

  useEffect(() => {
    reload()
  }, [reload])

  if (!state || !state.canSet || state.rows.length === 0) return null

  const total = state.rows.reduce((sum, r) => sum + (Number.parseInt(draft[r.spaceId] ?? '0', 10) || 0), 0)
  const overCap = total > MAX_TOTAL_PERCENT

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await setEventRevenueSplits(
        eventId,
        slug,
        state!.rows.map((r) => ({ spaceId: r.spaceId, percent: Number.parseInt(draft[r.spaceId] ?? '0', 10) || 0 })),
      )
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSaved(true)
      reload()
    })
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface-elevated/40 p-3">
      <span className={labelClasses}>
        Ticket shares <span className="font-normal text-subtle">(what each Collaborator earns from every ticket)</span>
      </span>
      <ul className="space-y-1.5">
        {state.rows.map((r) => (
          <li key={r.spaceId} className="flex items-center gap-2.5 rounded-card bg-surface px-3 py-2">
            {r.logoUrl ? (
              <Image src={r.logoUrl} alt={r.spaceName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-control object-cover" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-control bg-primary-bg text-3xs font-bold text-primary-strong">
                {getInitials(r.spaceName)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium text-text">{r.spaceName}</p>
              {!r.payoutsReady && (
                <p className="text-meta text-subtle">Payouts not set up yet, so no share can go here.</p>
              )}
            </div>
            <label className="flex shrink-0 items-center gap-1 text-meta text-subtle">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_TOTAL_PERCENT}
                step={1}
                value={draft[r.spaceId] ?? '0'}
                disabled={pending || !r.payoutsReady}
                aria-label={`${r.spaceName} share, percent of each ticket`}
                onChange={(e) => {
                  setSaved(false)
                  setDraft((d) => ({ ...d, [r.spaceId]: e.target.value }))
                }}
                className="w-16 text-right"
              />
              %
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-meta ${overCap ? 'text-danger' : 'text-subtle'}`}>
          {overCap
            ? `Shares can take at most ${MAX_TOTAL_PERCENT}% together.`
            : `Your Space keeps ${100 - total}% of each ticket. The network fee comes out of every share, including yours.`}
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={save} loading={pending} disabled={overCap}>
          Save shares
        </Button>
      </div>
      {saved && !error && <p className="text-meta text-success">Shares saved. They apply to the next ticket sold.</p>}
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  )
}
