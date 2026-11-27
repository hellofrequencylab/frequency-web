import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { relativeTime } from '@/lib/utils'
import { HOME_TZ } from '@/lib/time/home-zone'
import { notificationHref } from '@/lib/notifications/href'
import { SNOOZE_CHOICES, inboxCounts, inboxView, parseInboxView, type InboxView } from '@/lib/notifications/inbox'
import { loadInboxTodos } from '@/lib/notifications/inbox-todos'
import { FqFocusPage } from '@/components/frequency/members/shared/focus-page'
import { archiveNotice, loadInbox, snoozeNotice, unsnoozeNotice } from './actions'

// /inbox: ONE PLACE FOR WHAT NEEDS YOU (LIVE-2526, hub plan 2026-11-24). The same notices as the bell,
// sorted the way Linear's Inbox is: Priority (a tag, a direct message, a to-do handed to you), Other,
// the ones you snoozed, and To-dos (SCAN-1347: your open Plan to-dos across every Space). Done takes a notice out of every view; Snooze hides it for 3 hours, until
// tomorrow or for a week. Plain forms on server actions, so it works before any script loads.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Inbox',
  robots: { index: false, follow: false },
}

const VIEW_LABEL: Record<InboxView, string> = { priority: 'Priority', other: 'Other', snoozed: 'Snoozed', todos: 'To-dos' }
const EMPTY: Record<InboxView, { title: string; description: string }> = {
  priority: { title: 'Nothing needs you', description: 'When someone tags you, messages you or hands you a to-do, it lands here first.' },
  other: { title: 'You’re caught up', description: 'Replies, RSVPs and updates from your Spaces land here.' },
  snoozed: { title: 'Nothing snoozed', description: 'Snooze a notice and it waits here until its time comes.' },
  todos: { title: 'No open to-dos', description: 'To-dos handed to you on a Plan, and unclaimed ones on Plans you own, show up here.' },
}

/** A due date as a short day in the platform's home zone ("Nov 20"). */
function dueOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: HOME_TZ })
}

/** When a snoozed notice returns, in the platform's home zone ("Wed 9:00 AM"). */
function backAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: HOME_TZ })
}

export default async function InboxPage({ searchParams }: { searchParams?: Promise<{ view?: string | string[] }> }) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/inbox')
  const view = parseInboxView((await searchParams)?.view)
  const now = new Date()
  const [load, todos] = await Promise.all([loadInbox(), loadInboxTodos(profileId, now)])
  const all = load.kind === 'ok' ? load.items : []
  const counts = { ...inboxCounts(all, now), todos: todos.length }
  const items = inboxView(all, view, now)

  const tabs = (
    <nav className="row wrap" aria-label="Inbox views" style={{ gap: 8 }}>
      {(Object.keys(VIEW_LABEL) as InboxView[]).map((v) => (
        <Button key={v} asChild size="sm" variant={v === view ? 'secondary' : 'ghost'}>
          <Link href={v === 'priority' ? '/inbox' : `/inbox?view=${v}`} aria-current={v === view ? 'page' : undefined}>
            {VIEW_LABEL[v]}
            {counts[v] > 0 ? ` (${counts[v]})` : ''}
          </Link>
        </Button>
      ))}
      <Button asChild variant="ghost" size="sm">
        <Link href="/settings/notifications">Manage</Link>
      </Button>
    </nav>
  )

  const content =
    view === 'todos' ? (
      todos.length === 0 ? (
        <EmptyState variant="cleared" title={EMPTY.todos.title} description={EMPTY.todos.description} />
      ) : (
        <ul className="space-y-2" aria-label="Your open to-dos">
          {todos.map((t) => (
            <li key={t.id}>
              <RowCard
                href={t.href}
                title={t.title}
                badge={t.overdue ? <Badge tone="danger">Overdue</Badge> : undefined}
                meta={
                  <>
                    {t.dueAt ? `Due ${dueOn(t.dueAt)} · ` : ''}
                    {t.planTitle ? `${t.planTitle} · ` : ''}
                    {t.space.name}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )
    ) : load.kind === 'error' ? (
      <EmptyState variant="error" title="Your Inbox did not load" description="Something broke on our end. Refresh in a moment, or use the bell in the header." />
    ) : items.length === 0 ? (
      <EmptyState variant="cleared" title={EMPTY[view].title} description={EMPTY[view].description} />
    ) : (
      <ul className="space-y-2" aria-label={`${VIEW_LABEL[view]} notices`}>
        {items.map((n) => (
          <li key={n.id}>
            <RowCard
              href={notificationHref(n)}
              title={
                <>
                  {n.actor ? `${n.actor.display_name} ` : ''}
                  {n.body}
                </>
              }
              badge={n.read_at ? undefined : <Badge tone="primary">New</Badge>}
              meta={
                view === 'snoozed' && n.snoozed_until ? (
                  <>Back {backAt(n.snoozed_until)}</>
                ) : (
                  <time dateTime={n.created_at}>{relativeTime(n.created_at)}</time>
                )
              }
              dimmed={Boolean(n.read_at)}
              actions={
                <>
                  {view === 'snoozed' ? (
                    <form action={unsnoozeNotice}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Bring back
                      </Button>
                    </form>
                  ) : (
                    SNOOZE_CHOICES.map((c) => (
                      <form key={c.key} action={snoozeNotice}>
                        <input type="hidden" name="id" value={n.id} />
                        <input type="hidden" name="for" value={c.key} />
                        <Button type="submit" size="sm" variant="ghost" aria-label={`Snooze for ${c.label.toLowerCase()}`}>
                          {c.label}
                        </Button>
                      </form>
                    ))
                  )}
                  <form action={archiveNotice}>
                    <input type="hidden" name="id" value={n.id} />
                    <Button type="submit" size="sm" variant="secondary">
                      Done
                    </Button>
                  </form>
                </>
              }
            />
          </li>
        ))}
      </ul>
    )

  return (
    <FqFocusPage kicker="You" title="Inbox" meta="Everything that needs you, in one place. Priority is where someone named you." actions={tabs}>
      {content}
    </FqFocusPage>
  )
}
