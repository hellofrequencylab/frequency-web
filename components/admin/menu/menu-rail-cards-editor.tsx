'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import type { ResolvedMenu, ResolvedRailCard } from '@/lib/menus/types'
import { ensureMenu, createRailCard } from '@/lib/menus/actions'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { RailCardEditor } from './rail-card-editor'

// The featured Rail cards editor — the `menu-rail-cards` template block (10). It edits ONE slice of
// the active surface: its left/right featured cards (menu_rail_cards). Surface-scoped: the wrapping
// block resolves the active surface (lib/menus/active-surface) and passes the surface's menu in, so
// it stays in lock-step with the picker.
//
// COUPLING — this block does NOT materialize-on-default. The single auto-materialize lives in
// `menu-groups`; here we only ensure the menu row lazily on the first write (adding a card). Three
// blocks each firing materialize would race seedMenuFromDefaults and clobber, so only groups owns it.
export function MenuRailCardsEditor({
  initialMenu,
  surfaceKey,
}: {
  initialMenu: ResolvedMenu
  surfaceKey: ResolvedMenu['surfaceKey']
}) {
  const [menuId, setMenuId] = useState<string | undefined>(initialMenu.id)
  const [railCards, setRailCards] = useState<ResolvedRailCard[]>(initialMenu.railCards)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  function onStatus(msg: string) {
    setStatus(msg)
  }

  // The menu may be the code fallback (no DB id). Adding a card needs a real menu row, so ensure
  // one lazily and stamp the id locally. (Not a materialize — see the COUPLING note.)
  async function ensuredMenuId(): Promise<string | null> {
    if (menuId) return menuId
    const res = await ensureMenu(surfaceKey)
    if (!res.ok) {
      setError(res.error)
      return null
    }
    setMenuId(res.id)
    return res.id
  }

  function addRailCard(side: 'left' | 'right') {
    setError(null)
    onStatus('Adding rail card')
    startTransition(async () => {
      const id = await ensuredMenuId()
      if (!id) return
      const position = railCards.filter((c) => c.side === side).length
      const res = await createRailCard({
        menuId: id,
        side,
        title: 'New card',
        body: 'A short, inviting line.',
        href: '/feed',
        position,
      })
      if (res.ok) {
        const fresh: ResolvedRailCard = {
          id: res.id,
          side,
          title: 'New card',
          body: 'A short, inviting line.',
          href: '/feed',
          position,
          mode: 'active',
          roleModes: {},
        }
        setRailCards((cards) => [...cards, fresh])
        onStatus('Rail card added')
      } else {
        setError(res.error)
        onStatus('Could not add rail card')
      }
    })
  }

  return (
    <AdminSection
      title="Rail cards"
      description="Featured side cards on the menu panel, like the welcome card that invites a member to find their first circle."
      actions={
        <div className="flex items-center gap-2">
          {status && (
            <span className="text-xs text-subtle" aria-hidden>
              {status}
            </span>
          )}
          <button
            type="button"
            onClick={() => addRailCard('left')}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Left card
          </button>
          <button
            type="button"
            onClick={() => addRailCard('right')}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Right card
          </button>
        </div>
      }
    >
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {error && (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger-bg/40 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {railCards.length === 0 ? (
        <EmptyState
          title="No rail cards"
          description="Add a left or right card to feature a destination beside the links."
        />
      ) : (
        <ul className="space-y-2">
          {railCards.map((card) => (
            <RailCardEditor
              key={card.id}
              card={card}
              onStatus={onStatus}
              onChanged={(patch) =>
                setRailCards((cards) => cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)))
              }
              onDeleted={() => setRailCards((cards) => cards.filter((c) => c.id !== card.id))}
            />
          ))}
        </ul>
      )}
    </AdminSection>
  )
}
