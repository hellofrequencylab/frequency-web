import Link from 'next/link'
import { Megaphone, ArrowRight } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'
import { relativeTime } from '@/lib/utils'

// Leadership dashboard layout module (/lead): "Messages & dispatches" — the recent
// announcements going out to the people in this leader's own Circles, so they can keep
// an eye on what's being said in their programs and jump in to post when it's quiet.
//
// Every row is read live and SCOPED to getLedCircles(me.id) circle ids — there is no
// platform-wide read. We merge the two verified ways something gets "announced" to a
// circle, both keyed to those circle ids:
//   • dispatches  → audience_scope='circle', audience_id IN circleIds, status='published'
//                   (the titled broadcast that lands at /broadcast/{id})
//   • posts       → post_type='announcement', scope_id IN circleIds (the circle feed's
//                   "Dispatch" toggle — an announcement post pinned to the circle)
// Newest first, capped at MAX_ITEMS. Self-hides when there's nothing real to show.

const MAX_ITEMS = 5

type Item = {
  key: string
  /** The circle this dispatch went to. */
  circleName: string
  /** A short title or excerpt of what was said. */
  label: string
  /** ISO timestamp the dispatch went out (drives the relative time + sort). */
  at: string
  /** Where this row drills down to (the broadcast detail or the circle). */
  href: string
}

export async function LeadDispatches(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const circles = await getLedCircles(me.id)
  if (circles.length === 0) return null

  const admin = createAdminClient()
  const circleIds = circles.map((c) => c.id)
  const byId = new Map(circles.map((c) => [c.id, c]))

  // Two scoped reads, both filtered to the led circle ids — neither is unscoped.
  const [{ data: dispatchRows }, { data: announcementRows }] = await Promise.all([
    admin
      .from('dispatches')
      .select('id, title, excerpt, audience_id, published_at')
      .eq('status', 'published')
      .eq('audience_scope', 'circle')
      .in('audience_id', circleIds)
      .is('hidden_at', null)
      .order('published_at', { ascending: false })
      .limit(MAX_ITEMS),
    admin
      .from('posts')
      .select('id, body, scope_id, created_at')
      .eq('post_type', 'announcement')
      .in('scope_id', circleIds)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS),
  ])

  const items: Item[] = []

  for (const d of (dispatchRows ?? []) as {
    id: string
    title: string
    excerpt: string | null
    audience_id: string | null
    published_at: string | null
  }[]) {
    const circle = d.audience_id ? byId.get(d.audience_id) : undefined
    if (!circle || !d.published_at) continue
    items.push({
      key: `dispatch-${d.id}`,
      circleName: circle.name,
      label: d.title?.trim() || d.excerpt?.trim() || 'Announcement',
      at: d.published_at,
      href: `/broadcast/${d.id}`,
    })
  }

  for (const p of (announcementRows ?? []) as {
    id: string
    body: string | null
    scope_id: string | null
    created_at: string | null
  }[]) {
    const circle = p.scope_id ? byId.get(p.scope_id) : undefined
    if (!circle || !p.created_at) continue
    items.push({
      key: `post-${p.id}`,
      circleName: circle.name,
      label: excerpt(p.body),
      at: p.created_at,
      href: `/circles/${circle.slug}`,
    })
  }

  if (items.length === 0) return null

  const recent = items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, MAX_ITEMS)

  // Footer drill-in: the circle's feed is where a leader posts or dispatches; with one
  // circle, link straight to it, otherwise send them to the community broadcast surface.
  const single = circles.length === 1 ? circles[0] : null
  const footerHref = single ? `/circles/${single.slug}` : '/broadcast'
  const footerLabel = single ? `Post or dispatch in ${single.name}` : 'Post or dispatch'

  return (
    <section>
      <SectionHeader title="Messages & dispatches" count={recent.length} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {recent.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Megaphone className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs font-semibold uppercase tracking-widest text-primary-strong">
                  {item.circleName}
                </span>
                <span className="mt-0.5 block truncate text-sm font-medium text-text">{item.label}</span>
                <span className="mt-0.5 block text-xs text-subtle">{relativeTime(item.at)}</span>
              </span>
              <ArrowRight
                className="mt-1 hidden h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 sm:block"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={footerHref}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-strong transition-colors hover:text-primary motion-reduce:transition-none"
      >
        {footerLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  )
}

// A short, single-line excerpt of an announcement post's body for the list row. Strips
// the light markdown the composer writes so a row never shows stray ** or - markers.
function excerpt(body: string | null): string {
  const text = (body ?? '')
    .replace(/[*_`>#]/g, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return 'Announcement'
  return text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text
}
