'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { getMyNotifications, markAllRead } from '@/app/(main)/notifications/actions'
import type { NotificationItem } from '@/app/(main)/notifications/actions'
import { relativeTime } from '@/lib/utils'

const TYPE_ICON: Record<string, string> = {
  reaction:       '❤️',
  comment:        '💬',
  mention:        '@',
  dispatch:       '📣',
  lifecycle_day1: '👋',
  lifecycle_day3: '📅',
  lifecycle_day7: '🎉',
}

function notifHref(n: NotificationItem): string {
  if (n.reference_type === 'post' && n.reference_id) return `/feed`
  if (n.reference_type === 'dispatch' && n.reference_id) return `/broadcast/${n.reference_id}`
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
        className="relative p-2 rounded-lg text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl shadow-black/5 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">Notifications</p>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
            {!loaded && (
              <div className="py-8 text-center">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto" />
              </div>
            )}

            {loaded && notifications.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">No notifications yet</p>
            )}

            {notifications.map(n => (
              <Link
                key={n.id}
                href={notifHref(n)}
                onClick={() => setOpen(false)}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                  !n.read_at ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm shrink-0">
                  {TYPE_ICON[n.type] ?? '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                    {n.actor && (
                      <span className="font-semibold">{n.actor.display_name} </span>
                    )}
                    {n.body}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
