import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
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
