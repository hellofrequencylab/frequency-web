'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { getMyNotifications, markAllRead } from '@/app/(main)/notifications/actions'
import type { NotificationItem } from '@/lib/notifications-map'
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
}

function notifHref(n: NotificationItem): string {
  if (n.type === 'friend_request') return '/friends'
  if (n.type === 'friend_accepted' && n.reference_type === 'profile' && n.reference_id) {
    return '/friends'
  }
  if (n.reference_type === 'post' && n.reference_id) return `/feed`
  if (n.reference_type === 'dispatch' && n.reference_id) return `/broadcast/${n.reference_id}`
  if (n.reference_type === 'support_ticket' && n.reference_id) return `/support/${n.reference_id}`
  return '/feed'
}

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
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative p-2 rounded-lg text-muted hover:text-text hover:bg-surface-elevated transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-danger text-white text-[9px] font-bold leading-none px-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-surface-elevated shadow-xl shadow-black/5 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-text">Notifications</p>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs text-primary-strong hover:text-primary-hover transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {!loaded && (
              <div className="py-8 text-center">
                <div className="w-5 h-5 border-2 border-primary-bg border-t-primary rounded-full animate-spin mx-auto" />
              </div>
            )}

            {loaded && notifications.length === 0 && (
              <p className="py-8 text-center text-sm text-subtle">No notifications yet</p>
            )}

            {notifications.map(n => (
              <Link
                key={n.id}
                href={notifHref(n)}
                onClick={() => setOpen(false)}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors ${
                  !n.read_at ? 'bg-primary-bg/50' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-sm shrink-0">
                  {TYPE_ICON[n.type] ?? '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text leading-snug">
                    {n.actor && (
                      <span className="font-semibold">{n.actor.display_name} </span>
                    )}
                    {n.body}
                  </p>
                  <p className="text-2xs text-subtle mt-0.5">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
