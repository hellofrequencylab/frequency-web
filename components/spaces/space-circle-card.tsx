'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UsersRound } from 'lucide-react'
import { RowCard } from '@/components/cards/row-card'
import { Switch } from '@/components/ui/switch'
import { buttonClasses } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { setSpaceCircleOnAction } from '@/app/(main)/spaces/[slug]/manage/circles/actions'

// THE SPACE CIRCLE CARD (ADR-1391). The one Circle every Space always has, hosted by the Space, up to
// 300 members. It cannot be deleted or moved, so the only switch a Space needs is on or off. Off hides
// it everywhere and keeps its members, so switching it back on picks up where it left off.
//
// ── IT COMPOSES `RowCard` (ADR-1393) ────────────────────────────────────────────────────────────
//
// It hand-rolled its own bordered surface, icon chip, title and body when it shipped on 2026-09-16,
// which took `bespoke-cards` in scripts/adoption-baselines.json from 0 to 1 — the first entry in
// that debt class since it was zeroed. The scoreboard is advisory rather than blocking, which is
// exactly why it was worth closing the same day it was noticed: an advisory number that nobody ever
// acts on stops being read (the AGENTS.md rule about a fail-safe that fires silently).
//
// The mapping onto the kit's slots is the whole change, and it is a genuine fit rather than a
// wrapper for the gate's benefit: the icon is `anchor`, "Space Circle" is the `badge`, the host line
// and the member count are `context`, the on/off sentence is `description`, the Switch is `actions`
// (which takes the row out of anchor mode, so the control never nests inside the row's own link),
// and the error line plus "Open the circle" share the `footer` control bar.
//
// 🔴 `href` IS DELIBERATELY OMITTED. RowCard's default is to make the WHOLE row an anchor, and this
// row carries a Switch: a manager reaching for the toggle on a full-row link is one mis-tap from
// navigating away instead of turning their hub off. `actions` already cancels anchor mode, and the
// footer carries the real way in, so the row has a destination without being one.

export function SpaceCircleCard({
  spaceSlug,
  spaceName,
  circle,
}: {
  spaceSlug: string
  spaceName: string
  circle: { slug: string; name: string; status: string; memberCount: number; memberCap: number }
}) {
  const router = useRouter()
  const [on, setOn] = useState(circle.status !== 'inactive' && circle.status !== 'archived')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const toggle = (next: boolean) => {
    setError(null)
    setOn(next)
    start(async () => {
      const res = await setSpaceCircleOnAction(spaceSlug, next)
      if (isError(res)) {
        setOn(!next)
        setError(res.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <RowCard
      anchor={
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-primary/10 text-primary-strong">
          <UsersRound className="h-5 w-5" aria-hidden />
        </span>
      }
      title={circle.name}
      badge={
        <span className="inline-flex items-center rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-semibold text-muted">
          Space Circle
        </span>
      }
      context={`Hosted by ${spaceName} · ${circle.memberCount} of ${circle.memberCap} members`}
      description={
        on
          ? 'Your Space members can find it and join. It stays attached to your Space.'
          : 'Turned off. Nobody can see or join it, and its members are kept for when you turn it back on.'
      }
      actions={
        <label className="flex items-center gap-2 text-body-sm font-medium text-text">
          <span id="space-circle-on">{on ? 'On' : 'Off'}</span>
          <Switch checked={on} onCheckedChange={toggle} disabled={pending} aria-labelledby="space-circle-on" />
        </label>
      }
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/circles/${circle.slug}`} className={buttonClasses('secondary', 'sm')}>
            Open the circle
          </Link>
          {error && (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          )}
        </div>
      }
    />
  )
}
