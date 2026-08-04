import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { type CommunityRole, ROLE_RANK, RoleBadge } from '@/lib/community-roles'

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
  /** Resolved pricing figures a Tiers card can bind to, so a published CMS page never freezes a
   *  price into its document (ADR-918). Keyed by offering id; absent/`{}` means fall back to the
   *  janitor's typed text. */
  pricing?: Record<string, { label: string; price: string; strikePrice: string | null; yearly: string | null; takeRate: string }>
  memberCount: number
  circleCount: number
  upcomingEvents: LiveEvent[]
  posts: LivePost[]
  /** True when `posts` are real Vera-featured picks, not the latest-public fallback. */
  postsCurated: boolean
}

function hasRole(role: string | null | undefined): role is CommunityRole {
  return !!role && role in ROLE_RANK
}

// A live block must keep the page's SHAPE when its data is unavailable.
// `getLiveData` (lib/page-editor/live-data.ts) fires its RPCs in one Promise.all and
// fails open to `null`, and the marketing routes cache with ISR (`revalidate = 3600`),
// so a block that returned `null` on an empty list could freeze a whole section out of
// a public page for an hour on one transient RPC error. The blocks below render this
// note instead. It never invents posts, events, or counts.
function LiveDataNote({ text }: { text: string }) {
  return (
    <p className="rounded-card border border-border bg-surface px-5 py-8 text-center text-base text-subtle">
      {text}
    </p>
  )
}

// ── Live data blocks ──────────────────────────────────────────────────────────
export function LiveStatsBlock({ eyebrow, heading, live, pad, vis = '' }: { eyebrow?: string; heading?: string; live?: LiveData; pad?: string; vis?: string }) {
  // `?? 0` used to run for the whole block, which meant a failed data call published
  // "0 Members / 0 Circles" to a public page as though it were measured, and ISR froze
  // that for an hour. A wrong number is worse than a missing one: the reader cannot tell
  // it is wrong. So the counts render only when the call actually delivered. A real zero
  // still renders as 0 — that is data, not absence.
  const stats = live
    ? [
        { value: live.memberCount, label: 'Members' },
        { value: live.circleCount, label: 'Circles' },
        { value: live.upcomingEvents.length, label: 'Events soon' },
      ]
    : null
  return (
    <section className={`bg-surface px-6 ${pad ?? 'py-24 sm:py-28'} ${vis}`}>
      <div className="max-w-3xl mx-auto text-center">
        {eyebrow && <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">{eyebrow}</p>}
        {heading && <h2 className="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)] mb-12">{heading}</h2>}
        {stats ? (
          <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="font-display text-6xl sm:text-7xl text-text">{s.value.toLocaleString()}</p>
                <p className="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <LiveDataNote text="These numbers are taking a moment to load." />
        )}
      </div>
    </section>
  )
}

export function LiveEventsBlock({ live, pad, vis = '' }: { live?: LiveData; pad?: string; vis?: string }) {
  const events = live?.upcomingEvents ?? []
  // This block is nothing BUT the list: it carries no heading of its own, so when the
  // live data resolved and there genuinely are no upcoming events, hiding it is the
  // honest render. When `live` is absent the call never delivered, and vanishing would
  // silently delete the section from a cached page, so the note holds the slot instead.
  if (!events.length && live) return null
  return (
    <section className={`bg-marketing-canvas px-6 ${pad ?? 'py-20'} ${vis}`}>
      <div className="max-w-2xl mx-auto space-y-3">
        {!events.length && <LiveDataNote text="Events are taking a moment to load." />}
        {events.map((event) => {
          const d = new Date(event.starts_at)
          const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
          const day = d.getDate()
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          return (
            <div key={event.id} className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-primary-bg flex flex-col items-center justify-center">
                <span className="text-3xs font-bold text-primary-strong leading-none">{month}</span>
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
  // Never drop the section. The heading is authored copy that belongs to the page, so
  // it renders either way; only the body swaps for a note. `live` present with an empty
  // list is the closest signal we have to "genuinely nothing to show", so it gets the
  // plainer line; `live` missing means the call never delivered.
  if (!posts.length) {
    return (
      <section className={`bg-marketing-canvas px-6 ${pad ?? 'py-20 sm:py-24'} ${vis}`}>
        <div className="max-w-2xl mx-auto">
          {heading && <h2 className="text-center font-display uppercase text-text text-3xl sm:text-4xl mb-10 text-balance">{heading}</h2>}
          <LiveDataNote
            text={live ? 'No posts to show right now. Check back soon.' : 'Posts are taking a moment to load.'}
          />
        </div>
      </section>
    )
  }
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
              <article key={post.id} className="rounded-2xl border border-border bg-surface lift-1">
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    {a?.avatar_url ? (
                      <Image src={avatarSrc(a.avatar_url)} alt={a.display_name} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0" style={avatarFocusStyle(a.avatar_url)} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-elevated text-muted text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-semibold text-text truncate">{a?.display_name ?? 'Community member'}</span>
                        {showRole && <RoleBadge role={a!.community_role as CommunityRole} className="text-3xs leading-tight" />}
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
