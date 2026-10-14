import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { RowCard } from '@/components/cards/row-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { relativeTime } from '@/lib/utils'
import { notificationHref } from '@/lib/notifications/href'
import { getMyNotifications, markAllRead } from './actions'

// /notifications: the full list behind the bell. The URL was already promised and never answered:
// the admin and Space consoles' alerts link, the outreach push's tap-through (app/(main)/outreach/
// actions.ts) and markAllRead's revalidation all pointed here, and there was no page, so every one
// of them 404ed. Same read the bell makes (the `my_notifications` RPC, last 30), each row landing
// where the bell's row lands (lib/notifications/href.ts). A Focus surface, so it wears the members
// kit under Frequency through the shared primitives, and DAWN's own look under DAWN.
//
// It does not mark anything read on its own: a render cannot write (markAllRead revalidates this
// path), so "Mark all as read" is a plain form on the same server action the bell uses.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
}

export default async function NotificationsPage() {
  if (!(await getMyProfileId())) redirect('/sign-in?next=/notifications')

  const load = await getMyNotifications()
  const items = load.kind === 'ok' ? load.items : []
  const unread = items.filter((n) => !n.read_at).length

  return (
    <FocusTemplate
      eyebrow="You"
      title="Notifications"
      description="What happened while you were away. The newest 30, newest first."
      actions={
        <>
          {unread > 0 && (
            <form action={markAllRead}>
              <Button type="submit" variant="secondary" size="sm">
                Mark all as read
              </Button>
            </form>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings/notifications">Manage</Link>
          </Button>
        </>
      }
    >
      {load.kind === 'error' ? (
        <EmptyState
          variant="error"
          title="Notifications did not load"
          description="Something broke on our end. Refresh in a moment, or use the bell in the header."
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="cleared"
          title="You’re caught up"
          description="New replies, RSVPs and invites land here, and on the bell in the header."
          action={
            <Button asChild>
              <Link href="/feed">Back to Feed</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
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
                meta={<time dateTime={n.created_at}>{relativeTime(n.created_at)}</time>}
                dimmed={Boolean(n.read_at)}
              />
            </li>
          ))}
        </ul>
      )}
    </FocusTemplate>
  )
}
