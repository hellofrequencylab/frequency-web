'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { getMyNotifications, markAllRead } from '@/app/(main)/notifications/actions'
import type { NotificationItem } from '@/lib/notifications-map'
import { notificationHref } from '@/lib/notifications/href'
import { relativeTime } from '@/lib/utils'

const TYPE_ICON: Record<string, string> = {
  reaction:        '❤️',
  comment:         '💬',
  mention:         '@',
  dispatch:        '📣',
  lifecycle_day1:  '👋',
  lifecycle_day3:  '📅',
  lifecycle_day7:  '🎉',
  friend_request:  '👤',
  friend_accepted: '🤝',
  support_reply:   '🛟',
  space_update:    '📣',
  event_placement_request:  '📍',
  event_placement_approved: '📍',
  event_placement_declined: '📍',
  practice_reminder:        '🧘',
  practice_term_complete:   '🏁',
  practice_stale_check:     '🍂',
  journey_next_step:        '🗺️',
  journey_phase_unlocked:   '🗺️',
}

// Routing lives in lib/notifications/href (pure + unit-tested); the bell only renders it.

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  function handleOpen() {
    if (!open) {
      setOpen(true)
      // Opening the panel counts as "checked" — clear the unread badge immediately
      // and persist it (markAllRead), so notifications turn off once they're seen.
      if (unread > 0) {
        setUnread(0)
        startTransition(async () => {
          await markAllRead()
        })
      }
      if (!loaded) {
        startTransition(async () => {
          const items = await getMyNotifications()
          setNotifications(items)
          setLoaded(true)
        })
      }
    } else {
      setOpen(false)
    }
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllRead()
      setUnread(0)
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    })
  }

  return (
    <div ref={ref} className="relative">
      {/* `aria-expanded` + `aria-haspopup` were both missing, and that was two problems wearing
          one coat. A screen-reader user was told this is a button called "Notifications" and
          nothing about the panel it opens or whether it is already open. And the @overflow
          gate's overlay pass discovers what to click by looking for exactly those attributes —
          so the panel that hung 17px off the left of a 390px screen was invisible to the one
          check that would have caught it. Announcing the disclosure is what earns the coverage. */}
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className="relative p-2 rounded-lg text-muted hover:text-text hover:bg-surface-elevated transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-[14px] rounded-pill bg-danger text-on-danger text-3xs font-bold leading-none px-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        // 🔴 BELOW sm THIS IS A SHEET, NOT A POPOVER, because a popover cannot fit here.
        // `w-80` is 340px at this app's 17px root, and the bell sits ~67px in from the right
        // edge — so anchored `right-0` its left edge lands at viewport − 67 − 340, i.e. −17px
        // on a 390px iPhone and −57px on a 360px Android. The panel was clipped off the side
        // of the screen (the shell root carries `overflow-x-clip`, so there was no scrolling
        // to it), taking the "Notifications" heading and "Mark all read" with it.
        //
        // So on a phone it detaches from the bell and spans the viewport instead: `inset-x-2`
        // for the gutter, `top` under the app header, and a height capped to the gap between
        // the header and the tab bar's catch so the list scrolls INSIDE the panel rather than
        // disappearing under the bottom bar. From sm up the bell-anchored popover is unchanged.
        //
        // ⚠️ The offsets are the SAME tokens the bars are built from (`--app-header-h`,
        // `--tab-bar-clearance`), not literals that happen to match today — the mobile
        // stacking contract in components/sidebar/game-stats-dock.tsx is explicit that a
        // measured-from-a-literal offset is how the teaser pill and the RSVP bar each ended up
        // painted over.
        <div className="absolute right-0 top-full mt-2 w-80 max-sm:fixed max-sm:inset-x-2 max-sm:top-[calc(var(--app-header-h)+0.5rem)] max-sm:mt-0 max-sm:w-auto max-sm:max-h-[calc(100dvh-var(--app-header-h)-var(--tab-bar-clearance)-1rem)] max-sm:flex max-sm:flex-col rounded-card border border-border bg-surface-elevated lift-3 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-body-sm font-semibold text-text">Notifications</p>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-meta text-primary-strong hover:text-primary-hover transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* `max-sm:min-h-0` is what lets the sheet's height cap actually reach this list: a
              flex child's default `min-height:auto` refuses to shrink below its content, so the
              list would keep its full height and push the panel past the cap. Same floor rule as
              the `min-w-0` on the header and tab bar (ADR-1035), one axis over. */}
          <div className="max-h-96 max-sm:max-h-none max-sm:min-h-0 max-sm:flex-1 overflow-y-auto divide-y divide-border">
            {!loaded && (
              <div className="py-8 text-center">
                <div className="w-5 h-5 border-2 border-primary-bg border-t-primary rounded-full animate-spin mx-auto" />
              </div>
            )}

            {loaded && notifications.length === 0 && (
              <p className="py-8 text-center text-body-sm text-subtle">No notifications yet</p>
            )}

            {notifications.map(n => (
              <Link
                key={n.id}
                href={notificationHref(n)}
                onClick={() => setOpen(false)}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors ${
                  !n.read_at ? 'bg-primary-bg/50' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-pill bg-surface flex items-center justify-center text-body-sm shrink-0">
                  {TYPE_ICON[n.type] ?? '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-meta text-text leading-snug">
                    {n.actor && (
                      <span className="font-semibold">{n.actor.display_name} </span>
                    )}
                    {n.body}
                  </p>
                  <p className="text-2xs text-muted mt-0.5">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <span className="w-2 h-2 rounded-pill bg-primary shrink-0 mt-1" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
