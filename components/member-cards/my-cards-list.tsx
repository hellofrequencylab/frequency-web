'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Nfc } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { formatCardNumber } from '@/lib/member-cards/face'
import { setMyCardOn, setSpaceCardOn } from '@/lib/member-cards/actions'
import type { OwnedCard } from '@/lib/member-cards/store'

// The member's own cards on /crew/card (LIVE-1282): the printed number, the edition and a per-card
// on/off. Off is the lost-card switch for ONE card (member_cards.active), apart from the face's Pause,
// which covers every card at once. Optimistic: the switch flips, dims while the write is in flight,
// and flips back with the error line if it fails. The Space card view under Check in renders the same
// list with `spaceId`, so a Space owner gets the same switches for its cards (LIVE-1297). Copy obeys
// CONTENT-VOICE.

const EDITION = { founders: 'Founders edition', crew: 'Crew edition' } as const

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function MyCardsList({ cards, spaceId }: { cards: OwnedCard[]; spaceId?: string }) {
  return (
    <ul className="space-y-2">
      {cards.map((c) => (
        <CardRow key={c.id} card={c} spaceId={spaceId} />
      ))}
    </ul>
  )
}

function CardRow({ card, spaceId }: { card: OwnedCard; spaceId?: string }) {
  const router = useRouter()
  const [on, setOn] = useState(card.active)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const number = formatCardNumber(card.cardNumber) ?? 'Card'
  const labelId = `card-${card.id}-label`

  function flip(next: boolean) {
    setOn(next)
    setError(null)
    start(async () => {
      const r = spaceId ? await setSpaceCardOn(spaceId, card.id, next) : await setMyCardOn(card.id, next)
      if ('error' in r) {
        setOn(!next)
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
      <Nfc aria-hidden className="h-5 w-5 shrink-0 text-muted" />
      <div className="min-w-0 grow">
        <p id={labelId} className="text-body-sm font-bold tabular-nums text-text">
          {number} <span className="font-normal text-muted">· {EDITION[card.edition]}</span>
        </p>
        <p className="text-meta text-muted">
          {card.spaceName ? `Checks in at ${card.spaceName}` : 'Your Frequency card'}
          {card.lastUsedAt ? ` · last tapped ${day(card.lastUsedAt)}` : ` · added ${day(card.createdAt)}`}
          {!on && ' · off'}
        </p>
        {error && (
          <p role="alert" className="text-meta font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <Switch aria-labelledby={labelId} checked={on} pending={pending} onCheckedChange={flip} />
    </li>
  )
}
