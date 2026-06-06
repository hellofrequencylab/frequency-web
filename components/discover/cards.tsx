import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Users, MapPin, CalendarDays } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
import { eventDateBadge, formatEventDate } from '@/lib/discover'
import type { PublicCircle, PublicEvent, PublicPost, TopicalChannel } from '@/lib/discover'
import { Button, Card } from '@/components/marketing/marketing-ui'
import { communityHref } from '@/lib/community-href'

// Presentational building blocks shared by the /discover hub and detail pages.
// Social items (circles, events, authors) route to the real in-app community
// item via communityHref — straight there when authed, through /sign-in?next=
// when not. Topic cards stay on the public /discover/topics browse.

// ── Channel card ──────────────────────────────────────────────────────────────

export function ChannelCard({
  channel,
  circleCount,
}: {
  channel: TopicalChannel
  circleCount?: number
}) {
  return (
    <Link href={`/discover/topics/${channel.slug}`} className="group block h-full">
      <Card tone="feature" className="h-full hover:border-border-strong transition-colors flex flex-col">
        <h3 className="text-base font-bold text-text mb-2 group-hover:text-primary-strong transition-colors">
          {channel.name}
        </h3>
        {channel.description && (
          <p className="text-sm text-muted leading-relaxed line-clamp-3 flex-1">
            {channel.description}
          </p>
        )}
        {typeof circleCount === 'number' && (
          <p className="text-xs text-subtle mt-4 font-medium">
            {circleCount} {circleCount === 1 ? 'circle' : 'circles'}
          </p>
        )}
      </Card>
    </Link>
  )
}

// ── Circle card ───────────────────────────────────────────────────────────────

export function CircleCard({ circle, isAuthed = false }: { circle: PublicCircle; isAuthed?: boolean }) {
  return (
    <Link href={communityHref(`/circles/${circle.slug}`, isAuthed)} className="group block h-full">
      <Card tone="feature" className="h-full p-5 hover:border-border-strong transition-colors flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-bold text-text group-hover:text-primary-strong transition-colors">
          {circle.name}
        </h3>
        {circle.status === 'forming' && (
          <span className="shrink-0 text-3xs px-1.5 py-0.5 rounded-md font-medium bg-warning-bg text-warning capitalize">
            forming
          </span>
        )}
      </div>
      {circle.about && (
        <p className="text-sm text-muted leading-relaxed line-clamp-2 flex-1">{circle.about}</p>
      )}
      <div className="flex items-center gap-4 text-xs text-subtle mt-4">
        <span className="inline-flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {circle.member_count}
        </span>
        {circle.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {circle.city}
          </span>
        )}
        {circle.channel_name && <span className="ml-auto">{circle.channel_name}</span>}
      </div>
      </Card>
    </Link>
  )
}

// ── Event row ─────────────────────────────────────────────────────────────────

export function EventRow({ event, isAuthed = false }: { event: PublicEvent; isAuthed?: boolean }) {
  const badge = eventDateBadge(event.starts_at)
  return (
    <Link href={communityHref(`/events/${event.slug}`, isAuthed)} className="block">
      <Card
        tone="feature"
        className="flex items-center gap-4 px-5 py-4 hover:border-border-strong hover:shadow-pop transition-all"
      >
        <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-bg flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold text-primary-strong leading-none">{badge.month}</span>
          <span className="text-base font-bold text-primary-strong leading-tight">{badge.day}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{event.title}</p>
          <p className="text-xs text-subtle mt-0.5">
            {formatEventDate(event.starts_at)}
            {event.city && <> &middot; {event.city}</>}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-primary-strong shrink-0" />
      </Card>
    </Link>
  )
}

// ── Post preview (read-only social proof) ─────────────────────────────────────

export function PostPreview({ post, isAuthed = false }: { post: PublicPost; isAuthed?: boolean }) {
  const initials = post.author_display_name ? getInitials(post.author_display_name) : '?'
  const avatar = post.author_avatar_url ? (
    <Image
      src={post.author_avatar_url}
      alt={post.author_display_name ?? 'Member'}
      width={40}
      height={40}
      className="w-10 h-10 rounded-full object-cover shrink-0"
    />
  ) : (
    <div className="w-10 h-10 rounded-full bg-surface-elevated text-muted text-xs font-semibold flex items-center justify-center shrink-0 select-none">
      {initials}
    </div>
  )
  const identity = (
    <>
      {avatar}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-text truncate block">
          {post.author_display_name ?? 'Community member'}
        </span>
        <p className="text-2xs text-subtle mt-0.5">
          {post.author_handle && <>@{post.author_handle} · </>}
          {relativeTime(post.created_at)}
        </p>
      </div>
    </>
  )
  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      {post.author_handle ? (
        <Link
          href={communityHref(`/people/${post.author_handle}`, isAuthed)}
          className="flex items-start gap-3 mb-3 group"
        >
          {identity}
        </Link>
      ) : (
        <div className="flex items-start gap-3 mb-3">{identity}</div>
      )}
      <p className="text-sm text-text leading-relaxed line-clamp-3 mb-3">{post.body}</p>
      {post.media_urls && post.media_urls.length > 0 && (
        <div className="relative h-72 w-full rounded-xl overflow-hidden border border-border">
          <Image
            src={post.media_urls[0]}
            alt="Post attachment"
            fill
            sizes="(min-width: 768px) 36rem, 100vw"
            className="object-cover"
          />
        </div>
      )}
    </article>
  )
}

// ── Sign-in CTA ───────────────────────────────────────────────────────────────

export function SignInCta({
  title,
  body,
  action = 'Get started',
}: {
  title: string
  body: string
  action?: string
}) {
  return (
    <Card tone="feature" className="p-8 text-center">
      <p className="text-lg font-bold text-text mb-2">{title}</p>
      <p className="text-sm text-muted leading-relaxed mb-6 max-w-sm mx-auto">{body}</p>
      <Button href="/sign-in" size="sm">
        {action}
      </Button>
    </Card>
  )
}

// ── Icon re-export ────────────────────────────────────────────────────────────
// SectionHeading + the photo hero now live solely in the marketing kit; Discover
// imports PhotoHero / SectionHeading directly from there. No divergent copies.
export { CalendarDays }
