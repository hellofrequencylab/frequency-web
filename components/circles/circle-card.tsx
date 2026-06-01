import Link from 'next/link'
import { Users, MapPin, Globe } from 'lucide-react'
import { joinCircle } from '@/app/(main)/circles/actions'

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
}

// Circle card: a circular cover image with the basics underneath (name, place,
// a line of description, member count, and a join/open action). Centered, calm.
export function CircleCard({ circle, isMember }: { circle: CircleCardData; isMember: boolean }) {
  const full = circle.member_count >= circle.member_cap

  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-surface p-5 text-center shadow-sm transition-all hover:border-primary-bg hover:shadow-md">
      <Link href={`/circles/${circle.slug}`} className="shrink-0">
        {circle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={circle.imageUrl}
            alt={circle.name}
            className="h-20 w-20 rounded-full object-cover shadow-sm ring-2 ring-surface"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
            <Users className="h-8 w-8" />
          </div>
        )}
      </Link>

      <Link
        href={`/circles/${circle.slug}`}
        className="mt-3 text-base font-semibold text-text transition-colors hover:text-primary-strong"
      >
        {circle.name}
      </Link>

      <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-subtle">
        {circle.type === 'in-person' ? <MapPin className="h-3 w-3 shrink-0" /> : <Globe className="h-3 w-3 shrink-0" />}
        <span className="truncate">{circle.context ?? (circle.type === 'in-person' ? 'In person' : 'Online')}</span>
      </div>

      {circle.about && <p className="mt-2 line-clamp-2 text-sm text-muted">{circle.about}</p>}

      <p className="mt-2 text-xs text-subtle">
        {circle.member_count} {circle.member_count === 1 ? 'member' : 'members'}
      </p>

      <div className="mt-3">
        {isMember ? (
          <Link
            href={`/circles/${circle.slug}`}
            className="inline-flex rounded-lg bg-primary-bg px-3 py-1.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-bg/70"
          >
            Open circle →
          </Link>
        ) : !full ? (
          <form action={joinCircle.bind(null, circle.id, circle.slug)}>
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Join circle
            </button>
          </form>
        ) : (
          <Link
            href={`/circles/${circle.slug}`}
            className="inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            Full · View
          </Link>
        )}
      </div>
    </div>
  )
}
