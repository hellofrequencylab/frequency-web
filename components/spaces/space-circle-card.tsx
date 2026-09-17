'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UsersRound } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { buttonClasses } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { setSpaceCircleOnAction } from '@/app/(main)/spaces/[slug]/manage/circles/actions'

// THE SPACE CIRCLE CARD (ADR-1391). The one Circle every Space always has, hosted by the Space, up to
// 300 members. It cannot be deleted or moved, so the only switch a Space needs is on or off. Off hides
// it everywhere and keeps its members, so switching it back on picks up where it left off.

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
    <section aria-labelledby="space-circle-title" className="rounded-card border border-border bg-surface p-4 lift-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary-strong">
            <UsersRound className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-meta font-semibold text-muted">Space Circle</p>
            <h2 id="space-circle-title" className="truncate text-lead font-bold text-text">
              {circle.name}
            </h2>
            <p className="text-body-sm text-muted">
              Hosted by {spaceName} · {circle.memberCount} of {circle.memberCap} members
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-body-sm font-medium text-text">
          <span id="space-circle-on">{on ? 'On' : 'Off'}</span>
          <Switch checked={on} onCheckedChange={toggle} disabled={pending} aria-labelledby="space-circle-on" />
        </label>
      </div>
      <p className="mt-3 text-body-sm text-muted">
        {on
          ? 'Your Space members can find it and join. It stays attached to your Space.'
          : 'Turned off. Nobody can see or join it, and its members are kept for when you turn it back on.'}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/circles/${circle.slug}`} className={buttonClasses('secondary', 'sm')}>
          Open the circle
        </Link>
      </div>
    </section>
  )
}
