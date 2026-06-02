import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown, ArrowRight } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'
import { SiteImage } from '@/components/marketing/site-image'

// Presentational blocks shared by the Puck config (editor + public render) and
// the legacy splash fallback. Pure props in, markup out.

export type LivePost = {
  id: string
  body: string
  created_at: string
  media_urls: string[]
  author: { display_name: string; handle: string; avatar_url: string | null; community_role?: string } | null
}
export type LiveEvent = { id: string; title: string; starts_at: string; city: string | null; slug: string }
export type LiveData = {
  memberCount: number
  circleCount: number
  upcomingEvents: LiveEvent[]
  posts: LivePost[]
}

function hasRole(role: string | null | undefined): role is CommunityRole {
  return !!role && role in ROLE_RANK
}

// ── Splash hero (full-bleed image + overlay) ──────────────────────────────────
export function HeroBlock({
  eyebrow,
  title,
  subtitle,
  bgImage,
  ctaPrimaryLabel,
  ctaPrimaryHref,
  ctaSecondaryLabel,
  ctaSecondaryHref,
  note,
  vis = '',
}: {
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  bgImage?: string
  ctaPrimaryLabel?: string
  ctaPrimaryHref?: string
  ctaSecondaryLabel?: string
  ctaSecondaryHref?: string
  note?: string
  vis?: string
}) {
  return (
    <section className={`relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden ${vis}`}>
      <div className="absolute inset-0 scale-105">
        <Image
          src={bgImage || '/images/site/lab-thermal.jpg'}
          alt=""
          fill
          preload
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgb(20 18 16 / 0.74) 0%, rgb(20 18 16 / 0.42) 44%, rgb(20 18 16 / 0.94) 100%)',
        }}
      />
      <div className="amber-glow absolute inset-0 pointer-events-none" />
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl">
        {eyebrow && (
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.3em] text-primary mb-6">{eyebrow}</p>
        )}
        <h1 className="font-display uppercase text-white text-[2.75rem] leading-[0.95] sm:text-6xl lg:text-7xl max-w-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-7 text-base sm:text-lg text-white/80 max-w-lg leading-relaxed">{subtitle}</p>}
        <div className="mt-9 flex items-center gap-3 flex-wrap justify-center">
          {ctaPrimaryLabel && (
            <Link
              href={ctaPrimaryHref || '/beta'}
              className="rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              {ctaPrimaryLabel}
            </Link>
          )}
          {ctaSecondaryLabel && (
            <Link
              href={ctaSecondaryHref || '/sign-in'}
              className="rounded-2xl border border-white/30 px-8 py-3.5 text-base font-medium text-white hover:bg-white/10 hover:border-white/50 transition-colors"
            >
              {ctaSecondaryLabel}
            </Link>
          )}
        </div>
        {note && <p className="mt-8 text-sm text-white/45">{note}</p>}
      </div>
      <div className="absolute bottom-10 flex flex-col items-center gap-2 text-white/40">
        <span className="text-[11px] font-bold tracking-widest uppercase">See the vision</span>
        <ChevronDown className="w-5 h-5 animate-bounce" />
      </div>
    </section>
  )
}

// ── Feature gallery (image tiles) ─────────────────────────────────────────────
export function GalleryBlock({
  eyebrow,
  heading,
  items,
  cols = '2',
  tileAspect = '16/10',
  tileRadius = 'rounded-2xl',
  pad,
  vis = '',
}: {
  eyebrow?: string
  heading?: string
  items: { image?: string; title?: string; body?: string }[]
  cols?: string
  tileAspect?: string
  tileRadius?: string
  pad?: string
  vis?: string
}) {
  const colsClass =
    cols === '3'
      ? 'sm:grid-cols-2 lg:grid-cols-3'
      : cols === '4'
        ? 'sm:grid-cols-2 lg:grid-cols-4'
        : 'sm:grid-cols-2'
  return (
    <section className={`bg-surface px-6 ${pad ?? 'py-16 sm:py-20'} ${vis}`}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          {eyebrow && <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-3">{eyebrow}</p>}
          {heading && <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">{heading}</h2>}
        </div>
        <div className={`grid grid-cols-1 ${colsClass} gap-5`}>
          {(items || []).map((f, i) => (
            <article key={i} className={`${tileRadius} overflow-hidden border border-border bg-surface`}>
              <SiteImage src={f.image || '/images/site/lab-pool.jpg'} alt={f.title || ''} aspect={tileAspect} sizes="(min-width: 640px) 40rem, 100vw" />
              <div className="p-6">
                <h3 className="text-xl font-bold text-text mb-1.5">{f.title}</h3>
                <p className="text-base text-muted leading-relaxed">{f.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── "What we're building" dark band (marquee + circular pillars) ──────────────
import { Marquee } from '@/components/marketing/marketing-ui'

export function PillarsBlock({
  marqueeItems,
  pillars,
  vis = '',
}: {
  marqueeItems: string[]
  pillars: { image?: string; title?: string; body?: string; href?: string; reverse?: boolean }[]
  vis?: string
}) {
  return (
    <section className={`relative bg-slat ${vis}`}>
      <div className="light-strip absolute inset-x-0 top-0 z-10" />
      <Marquee items={marqueeItems?.length ? marqueeItems : ['What we’re building']} />
      <div className="max-w-5xl mx-auto px-6 py-24 sm:py-28 space-y-24 sm:space-y-28">
        {(pillars || []).map((p, i) => (
          <div
            key={i}
            className={`flex flex-col items-center sm:items-stretch sm:flex-row ${p.reverse ? 'sm:flex-row-reverse' : ''}`}
          >
            <div className="relative w-80 h-80 sm:w-[32rem] sm:h-[32rem] rounded-full overflow-hidden border-4 border-white/10 shrink-0">
              <Image src={p.image || '/images/site/lab-storefront.jpg'} alt={p.title || ''} fill sizes="(min-width: 640px) 32rem, 20rem" className="object-cover" />
            </div>
            <div className={`relative z-10 flex flex-col justify-center max-w-md -mt-12 sm:mt-0 ${p.reverse ? 'sm:-mr-20' : 'sm:-ml-20'}`}>
              <h3 className="font-display uppercase text-white text-4xl sm:text-5xl mb-5 px-2 text-center sm:text-left">{p.title}</h3>
              <div className="bg-surface rounded-3xl p-8 shadow-2xl">
                <p className="text-base text-muted leading-relaxed">{p.body}</p>
                {p.href && (
                  <Link href={p.href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary-strong hover:underline">
                    Learn more <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" />
    </section>
  )
}

// ── Live data blocks ──────────────────────────────────────────────────────────
export function LiveStatsBlock({ eyebrow, heading, live, pad, vis = '' }: { eyebrow?: string; heading?: string; live?: LiveData; pad?: string; vis?: string }) {
  const stats = [
    { value: live?.memberCount ?? 0, label: 'Members' },
    { value: live?.circleCount ?? 0, label: 'Circles' },
    { value: live?.upcomingEvents.length ?? 0, label: 'Events soon' },
  ]
  return (
    <section className={`bg-surface px-6 ${pad ?? 'py-24 sm:py-28'} ${vis}`}>
      <div className="max-w-3xl mx-auto text-center">
        {eyebrow && <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">{eyebrow}</p>}
        {heading && <h2 className="font-display uppercase text-text text-4xl sm:text-5xl mb-12">{heading}</h2>}
        <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="font-display text-6xl sm:text-7xl text-text">{s.value.toLocaleString()}</p>
              <p className="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function LiveEventsBlock({ live, pad, vis = '' }: { live?: LiveData; pad?: string; vis?: string }) {
  const events = live?.upcomingEvents ?? []
  if (!events.length) return null
  return (
    <section className={`bg-marketing-canvas px-6 ${pad ?? 'py-20'} ${vis}`}>
      <div className="max-w-2xl mx-auto space-y-3">
        {events.map((event) => {
          const d = new Date(event.starts_at)
          const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
          const day = d.getDate()
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          return (
            <div key={event.id} className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-bg flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold text-primary-strong leading-none">{month}</span>
                <span className="text-base font-bold text-primary-strong leading-tight">{day}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-text truncate">{event.title}</p>
                <p className="text-sm text-subtle mt-0.5">
                  {dateStr}
                  {event.city && <> &middot; {event.city}</>}
                </p>
              </div>
              <Link href="/beta" className="flex items-center gap-1 text-sm font-semibold text-primary-strong hover:underline shrink-0">
                Join <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function LivePostsBlock({ heading, live, pad, vis = '' }: { heading?: string; live?: LiveData; pad?: string; vis?: string }) {
  const posts = live?.posts ?? []
  if (!posts.length) return null
  return (
    <section className={`bg-marketing-canvas px-6 ${pad ?? 'py-20 sm:py-24'} ${vis}`}>
      <div className="max-w-2xl mx-auto">
        {heading && <h2 className="text-center font-display uppercase text-text text-3xl sm:text-4xl mb-10 text-balance">{heading}</h2>}
        <div className="space-y-4">
          {posts.map((post) => {
            const a = post.author
            const showRole = hasRole(a?.community_role ?? null)
            const initials = a?.display_name ? getInitials(a.display_name) : '?'
            return (
              <article key={post.id} className="rounded-2xl border border-border bg-surface shadow-sm">
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    {a?.avatar_url ? (
                      <Image src={a.avatar_url} alt={a.display_name} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-elevated text-muted text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-semibold text-text truncate">{a?.display_name ?? 'Community member'}</span>
                        {showRole && <RoleBadge role={a!.community_role as CommunityRole} className="text-[10px] leading-tight" />}
                      </div>
                      <p className="text-xs text-subtle mt-0.5">
                        {a?.handle && <>@{a.handle} · </>}
                        {relativeTime(post.created_at)}
                      </p>
                    </div>
                  </div>
                  <p className="text-base text-text leading-relaxed line-clamp-3">{post.body}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
