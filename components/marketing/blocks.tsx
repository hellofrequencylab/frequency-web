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

/** The live fields that carry a per-source outcome. Keyed by the field a consumer READS, not by
 *  the RPC behind it: `posts` collapses the featured + latest-public pair, because a consumer sees
 *  one list and needs one answer about it. `pricing` is absent on purpose — see `LiveData.status`. */
export type LiveField = 'memberCount' | 'circleCount' | 'upcomingEvents' | 'posts'

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
  /** Did each field's read actually deliver? The fields above are FAIL-SOFT DEFAULTS (`0`, `[]`)
   *  so existing readers keep working, which means the value alone cannot tell "measured zero"
   *  from "the query failed". This map is the truth; read it through `readLive`, never by hand.
   *
   *  `pricing` is deliberately not in here: `getLivePricing` catches its own failures and returns
   *  `{}`, so an empty pricing map is genuinely indistinguishable from a failed read at this
   *  boundary. Claiming a status for it would be the same lie this map exists to remove. */
  status: Record<LiveField, 'ok' | 'error'>
}

/** One field's outcome. The failed branch has NO `value`, so `readLive(...).value` is
 *  `T | undefined` until you narrow on `ok`. Forgetting the check is a type error, not a
 *  silently-wrong render. */
export type LiveRead<T> = { ok: true; value: T } | { ok: false; value?: undefined }

/** Read one live field together with whether its source delivered.
 *
 *  Two different failures land in the same place: the whole `getLiveData` call failing (`live`
 *  is undefined) and one RPC failing inside it (`status[field] === 'error'`). Both mean "we do
 *  not know", and a caller should say so rather than render an empty list as a fact.
 *
 *  `status` missing entirely is treated as delivered: the metadata channel is `any`-typed, so an
 *  older or hand-built `live` object can still reach a block at runtime, and the pre-existing
 *  contract was that a present `live` had delivered. */
export function readLive<K extends LiveField>(live: LiveData | undefined, field: K): LiveRead<LiveData[K]> {
  if (!live || live.status?.[field] === 'error') return { ok: false }
  return { ok: true, value: live[field] }
}

function hasRole(role: string | null | undefined): role is CommunityRole {
  return !!role && role in ROLE_RANK
}

// A live block must keep the page's SHAPE when its data is unavailable, and must say which
// kind of unavailable it is. The marketing routes cache with ISR (`revalidate = 3600`), so a
// wrong render on one transient RPC error sticks on a public page for an hour: a section that
// vanished stays gone, and "nothing to show" reads as a fact about the community rather than a
// fact about the query. `getLiveData` therefore reports per-field status (see `LiveData.status`),
// the blocks below read it through `readLive`, and this note carries whichever line is true.
// It never invents posts, events, or counts.
function LiveDataNote({ text }: { text: string }) {
  return (
    <p className="rounded-card border border-border bg-surface px-5 py-8 text-center text-body text-subtle">
      {text}
    </p>
  )
}

// ── Live data blocks ──────────────────────────────────────────────────────────
export function LiveStatsBlock({ eyebrow, heading, live, pad, vis = '' }: { eyebrow?: string; heading?: string; live?: LiveData; pad?: string; vis?: string }) {
  // A wrong number is worse than a missing one: the reader cannot tell it is wrong, and ISR
  // freezes it for an hour. `getLiveData` fills a failed count with 0 so older readers keep
  // working, so the value alone cannot be trusted here. Every count must have delivered before
  // any of them render, since one placeholder 0 sitting next to two real figures reads as
  // measured. A real zero still renders as 0. That is data, not absence.
  const members = readLive(live, 'memberCount')
  const circles = readLive(live, 'circleCount')
  const events = readLive(live, 'upcomingEvents')
  const stats =
    members.ok && circles.ok && events.ok
      ? [
          { value: members.value, label: 'Members' },
          { value: circles.value, label: 'Circles' },
          { value: events.value.length, label: 'Events soon' },
        ]
      : null
  return (
    <section className={`bg-surface px-6 ${pad ?? 'py-24 sm:py-28'} ${vis}`}>
      <div className="max-w-3xl mx-auto text-center">
        {eyebrow && <p className="text-body-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">{eyebrow}</p>}
        {heading && <h2 className="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)] mb-12">{heading}</h2>}
        {stats ? (
          <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="font-display text-6xl sm:text-7xl text-text">{s.value.toLocaleString()}</p>
                <p className="text-meta text-subtle mt-3 uppercase tracking-widest font-bold">{s.label}</p>
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
  const read = readLive(live, 'upcomingEvents')
  const events = read.value ?? []
  // This block is nothing BUT the list: it carries no heading of its own, so when the read
  // delivered and there genuinely are no upcoming events, hiding it is the honest render.
  // When it did not deliver we do not know that, and vanishing would silently delete the
  // section from a cached page, so the note holds the slot instead.
  if (read.ok && !events.length) return null
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
                <span className="text-body font-bold text-primary-strong leading-tight">{day}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-semibold text-text truncate">{event.title}</p>
                <p className="text-body-sm text-subtle mt-0.5">
                  {dateStr}
                  {event.city && <> &middot; {event.city}</>}
                </p>
              </div>
              <Link href="/beta" className="flex items-center gap-1 text-body-sm font-semibold text-primary-strong hover:underline shrink-0">
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
  const read = readLive(live, 'posts')
  const posts = read.value ?? []
  // Never drop the section. The heading is authored copy that belongs to the page, so it
  // renders either way; only the body swaps for a note. Which note is decided by the read,
  // not by the length: a delivered read with an empty list is genuinely nothing to show, and
  // gets the plainer line. A failed read gets the loading line, because an empty list there
  // is a fact about the query, not about the community.
  if (!posts.length) {
    return (
      <section className={`bg-marketing-canvas px-6 ${pad ?? 'py-20 sm:py-24'} ${vis}`}>
        <div className="max-w-2xl mx-auto">
          {heading && <h2 className="text-center font-display uppercase text-text text-3xl sm:text-4xl mb-10 text-balance">{heading}</h2>}
          <LiveDataNote
            text={read.ok ? 'No posts to show right now. Check back soon.' : 'Posts are taking a moment to load.'}
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
                      <Image src={avatarSrc(a.avatar_url)} alt={a.display_name} width={40} height={40} className="w-10 h-10 rounded-pill object-cover shrink-0" style={avatarFocusStyle(a.avatar_url)} />
                    ) : (
                      <div className="w-10 h-10 rounded-pill bg-surface-elevated text-muted text-meta font-semibold flex items-center justify-center shrink-0 select-none">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-body font-semibold text-text truncate">{a?.display_name ?? 'Community member'}</span>
                        {showRole && <RoleBadge role={a!.community_role as CommunityRole} className="text-3xs leading-tight" />}
                      </div>
                      <p className="text-meta text-subtle mt-0.5">
                        {a?.handle && <>@{a.handle} · </>}
                        {relativeTime(post.created_at)}
                      </p>
                    </div>
                  </div>
                  <p className="text-body text-text leading-relaxed line-clamp-3">{post.body}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
