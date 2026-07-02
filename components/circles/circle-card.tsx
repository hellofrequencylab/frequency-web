import Link from 'next/link'
import Image from 'next/image'
import { Users, MapPin, Globe, Sparkles } from 'lucide-react'
import { JoinCircleButton } from '@/components/circles/join-circle-button'
import { EntityCard } from '@/components/cards/entity-card'
import { DemoBadge } from '@/components/ui/demo-badge'
import { FeaturedBadge } from '@/components/ui/featured-badge'
import { StarterBadge } from '@/components/ui/starter-badge'
import { TemplateHeaderArt } from '@/components/circles/template-art'
import type { PillarSlug } from '@/lib/pillars'

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
  /** Operator-Featured (circles.featured_at) — badge it as a curated pick. */
  isFeatured?: boolean
  /** A virtual Starter Circle (a staff blueprint surfaced near the viewer). Links
   *  to the /circles/starter/<slug> preview and offers Remix, not Join — it is not
   *  a real circle with members. */
  isStarter?: boolean
  /** Primary Pillar — lets a Starter card fall back to the drawn header art (themed
   *  by Pillar) when it has no uploaded cover photo. */
  primaryPillar?: PillarSlug
}

// Circle card — renders through the shared EntityCard so circles read identically
// to every other entity grid. Avatar → anchor, name → title, place line + member
// count → context, about → description, mode pill → meta, join/open → action.
export function CircleCard({ circle, isMember }: { circle: CircleCardData; isMember: boolean }) {
  const full = circle.member_count >= circle.member_cap
  const memberLabel = `${circle.member_count} ${circle.member_count === 1 ? 'member' : 'members'}`
  const place = circle.context ?? (circle.type === 'in-person' ? 'In person' : 'Online')
  // Capacity meter — the Meetup-style "filling up" signal. Starters carry no real
  // membership (cap 0), so they skip it.
  const cap = circle.member_cap
  const hasCap = !circle.isStarter && cap > 0
  const pct = hasCap ? Math.min(100, Math.round((circle.member_count / cap) * 100)) : 0
  const spotsLeft = hasCap ? Math.max(0, cap - circle.member_count) : 0
  const nearlyFull = hasCap && !full && circle.member_count / cap >= 0.8
  // Starters are virtual: they open a claim-able preview, never the live circle, and
  // carry no membership of their own.
  const href = circle.isStarter ? `/circles/starter/${circle.slug}` : `/circles/${circle.slug}`

  return (
    <EntityCard
      href={href}
      dimmed={circle.isDemo}
      badge={
        circle.isStarter || circle.isFeatured || circle.isDemo ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {circle.isStarter && <StarterBadge />}
            {circle.isFeatured && <FeaturedBadge />}
            {circle.isDemo && <DemoBadge />}
          </span>
        ) : undefined
      }
      cover={
        circle.imageUrl ? (
          <Image
            src={circle.imageUrl}
            alt={circle.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
            className="object-cover"
          />
        ) : circle.isStarter && circle.primaryPillar ? (
          <TemplateHeaderArt slug={circle.slug} primaryPillar={circle.primaryPillar} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg text-primary-strong">
            <Users className="h-9 w-9" />
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
        circle.isStarter ? (
          <>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Ready to start
            </span>
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium capitalize text-subtle">
              In person
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1 font-medium text-muted">
              <Users className="h-3 w-3" />
              {hasCap ? `${circle.member_count} of ${cap}` : memberLabel}
            </span>
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium capitalize text-subtle">
              {circle.type === 'in-person' ? 'In person' : 'Online'}
            </span>
            {hasCap &&
              (full ? (
                <span className="font-semibold text-danger">Full</span>
              ) : nearlyFull ? (
                <span className="font-semibold text-warning">Almost full</span>
              ) : (
                <span className="text-subtle">
                  {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
                </span>
              ))}
            {hasCap && (
              <div className="mt-1 w-full">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      full ? 'bg-danger' : nearlyFull ? 'bg-warning' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.max(6, pct)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )
      }
      action={
        circle.isStarter ? (
          <Link
            href={href}
            className="inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
          >
            Remix
          </Link>
        ) : isMember ? (
          <Link
            href={`/circles/${circle.slug}`}
            className="inline-flex rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold text-primary-strong shadow-sm ring-1 ring-border transition-colors hover:bg-surface-elevated"
          >
            Open
          </Link>
        ) : !full ? (
          <JoinCircleButton
            circleId={circle.id}
            circleSlug={circle.slug}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
          />
        ) : (
          <span className="inline-flex rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-sm ring-1 ring-border">
            Full
          </span>
        )
      }
    />
  )
}
