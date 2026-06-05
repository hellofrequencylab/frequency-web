import Link from 'next/link'
import Image from 'next/image'
import { Users, MapPin, Globe } from 'lucide-react'
import { joinCircle } from '@/app/(main)/circles/actions'
import { EntityCard } from '@/components/cards/entity-card'
import { DemoBadge } from '@/components/ui/demo-badge'

export type CircleCardData = {
  id: string
  name: string
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  /** Precomputed "Neighborhood · Nexus" line, or the interest for online circles. */
  context?: string | null
  imageUrl?: string | null
  /** Beta demo circle — badge it and let it recede behind real circles. */
  isDemo?: boolean
}

// Circle card — renders through the shared EntityCard so circles read identically
// to every other entity grid. Avatar → anchor, name → title, place line + member
// count → context, about → description, mode pill → meta, join/open → action.
export function CircleCard({ circle, isMember }: { circle: CircleCardData; isMember: boolean }) {
  const full = circle.member_count >= circle.member_cap
  const memberLabel = `${circle.member_count} ${circle.member_count === 1 ? 'member' : 'members'}`
  const place = circle.context ?? (circle.type === 'in-person' ? 'In person' : 'Online')

  return (
    <EntityCard
      href={`/circles/${circle.slug}`}
      dimmed={circle.isDemo}
      badge={circle.isDemo ? <DemoBadge /> : undefined}
      anchor={
        circle.imageUrl ? (
          <Image
            src={circle.imageUrl}
            alt={circle.name}
            width={44}
            height={44}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
            <Users className="h-5 w-5" />
          </div>
        )
      }
      title={circle.name}
      context={
        <span className="inline-flex items-center gap-1.5">
          {circle.type === 'in-person' ? (
            <MapPin className="h-3 w-3 shrink-0" />
          ) : (
            <Globe className="h-3 w-3 shrink-0" />
          )}
          {place}
        </span>
      }
      description={circle.about ?? undefined}
      meta={
        <>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {memberLabel}
          </span>
          <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium capitalize text-subtle">
            {circle.type === 'in-person' ? 'In person' : 'Online'}
          </span>
        </>
      }
      action={
        isMember ? (
          <Link
            href={`/circles/${circle.slug}`}
            className="inline-flex rounded-lg bg-primary-bg px-3 py-1.5 text-xs font-semibold text-primary-strong transition-colors hover:bg-primary-bg/70"
          >
            Open
          </Link>
        ) : !full ? (
          <form action={joinCircle.bind(null, circle.id, circle.slug)}>
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Join
            </button>
          </form>
        ) : (
          <span className="inline-flex rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
            Full
          </span>
        )
      }
    />
  )
}
