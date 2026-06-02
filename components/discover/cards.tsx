import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Users, MapPin, CalendarDays } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
import { eventDateBadge, formatEventDate } from '@/lib/discover'
import type { PublicCircle, PublicEvent, PublicPost, TopicalChannel } from '@/lib/discover'

// Presentational building blocks shared by the /discover hub and detail pages.
// All read-only: every interaction control is a link to /sign-in.

// ── Channel card ──────────────────────────────────────────────────────────────

export function ChannelCard({
  channel,
  circleCount,
}: {
  channel: TopicalChannel
  circleCount?: number
}) {
  return (
    <Link
      href={`/discover/topics/${channel.slug}`}
      className="group rounded-2xl border border-border bg-surface p-6 hover:border-border-strong transition-colors flex flex-col"
    >
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
    </Link>
  )
}

// ── Circle card ───────────────────────────────────────────────────────────────

export function CircleCard({ circle }: { circle: PublicCircle }) {
  return (
    <Link
      href={`/discover/circles/${circle.id}`}
      className="group rounded-2xl border border-border bg-surface p-5 hover:border-border-strong transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-base font-bold text-text group-hover:text-primary-strong transition-colors">
          {circle.name}
        </h3>
        {circle.status === 'forming' && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-warning-bg text-warning capitalize">
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
    </Link>
  )
}

// ── Event row ─────────────────────────────────────────────────────────────────

export function EventRow({ event }: { event: PublicEvent }) {
  const badge = eventDateBadge(event.starts_at)
  return (
    <Link
      href={`/discover/events/${event.slug}`}
      className="flex items-center gap-4 rounded-2xl border border-success-bg bg-success-bg/40 px-5 py-4 hover:border-success transition-colors"
    >
      <div className="shrink-0 w-12 h-12 rounded-xl bg-success-bg flex flex-col items-center justify-center">
        <span className="text-[9px] font-bold text-success leading-none">{badge.month}</span>
        <span className="text-base font-bold text-success leading-tight">{badge.day}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{event.title}</p>
        <p className="text-xs text-subtle mt-0.5">
          {formatEventDate(event.starts_at)}
          {event.city && <> &middot; {event.city}</>}
        </p>
      </div>
      <ArrowRight className="w-4 h-4 text-success shrink-0" />
    </Link>
  )
}

// ── Post preview (read-only social proof) ─────────────────────────────────────

export function PostPreview({ post }: { post: PublicPost }) {
  const initials = post.author_display_name ? getInitials(post.author_display_name) : '?'
  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <div className="flex items-start gap-3 mb-3">
        {post.author_avatar_url ? (
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
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-text truncate block">
            {post.author_display_name ?? 'Community member'}
          </span>
          <p className="text-[11px] text-subtle mt-0.5">
            {post.author_handle && <>@{post.author_handle} · </>}
            {relativeTime(post.created_at)}
          </p>
        </div>
      </div>
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
    <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
      <p className="text-lg font-bold text-text mb-2">{title}</p>
      <p className="text-sm text-muted leading-relaxed mb-6 max-w-sm mx-auto">{body}</p>
      <Link
        href="/sign-in"
        className="inline-block rounded-2xl bg-primary text-on-primary px-7 py-3 text-sm font-bold hover:bg-primary-hover transition-colors"
      >
        {action}
      </Link>
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────

export function SectionHeading({
  eyebrow,
  title,
  tone = 'primary',
}: {
  eyebrow: string
  title: string
  tone?: 'primary' | 'success'
}) {
  const eyebrowCls = tone === 'success' ? 'text-success' : 'text-primary-strong'
  return (
    <>
      <p className={`text-sm font-bold uppercase tracking-[0.25em] mb-4 ${eyebrowCls}`}>
        {eyebrow}
      </p>
      <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">{title}</h2>
    </>
  )
}

// ── Photo hero (shared by the Discover hub + detail pages) ─────────────────────
// Full-bleed photo under a warm ink wash + amber glow + an LED light-strip seam,
// matching the splash. Editorial display headline in white. Pass `children` for
// CTAs/stat lines.
export function DiscoverHero({
  image,
  alt = '',
  eyebrow,
  title,
  subtitle,
  children,
  focal = 'object-center',
}: {
  image: string
  alt?: string
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  children?: React.ReactNode
  focal?: string
}) {
  return (
    <section className="relative overflow-hidden">
      <Image
        src={image}
        alt={alt}
        fill
        preload
        sizes="100vw"
        className={`object-cover ${focal}`}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgb(20 18 16 / 0.72) 0%, rgb(20 18 16 / 0.52) 45%, rgb(20 18 16 / 0.92) 100%)',
        }}
      />
      <div className="amber-glow absolute inset-0 pointer-events-none" />
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-24 sm:py-32 text-center">
        {eyebrow && (
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary mb-5">{eyebrow}</p>
        )}
        <h1 className="font-display uppercase text-white text-5xl sm:text-6xl lg:text-7xl text-balance leading-[0.95]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-6 text-lg sm:text-xl text-white/80 leading-relaxed max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-9">{children}</div>}
      </div>
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
    </section>
  )
}

export { CalendarDays }
