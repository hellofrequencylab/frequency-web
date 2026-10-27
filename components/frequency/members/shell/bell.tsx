'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { getMyNotifications, markAllRead } from '@/app/(main)/notifications/actions'
import type { NotificationItem } from '@/lib/notifications-map'
import { notificationHref } from '@/lib/notifications/href'
import { relativeTime } from '@/lib/utils'

// The bell's state is shared between its button (the dot) and the sheet (the list), so it lives in
// a tiny module-level store rather than the header: opening the sheet clears the dot the way the
// DAWN bell does (load the list FIRST, then mark read, SCAN-686).
let bellUnread = 0
const bellSubs = new Set<(n: number) => void>()
function setBellUnread(n: number) {
  bellUnread = n
  bellSubs.forEach((f) => f(n))
}

export function BellButton({ unreadCount, open, onToggle }: { unreadCount: number; open: boolean; onToggle: () => void }) {
  const unavailable = unreadCount < 0
  const [unread, setUnread] = useState(unavailable ? 0 : unreadCount)
  useEffect(() => {
    bellSubs.add(setUnread)
    setBellUnread(unavailable ? 0 : unreadCount)
    return () => {
      bellSubs.delete(setUnread)
    }
  }, [unreadCount, unavailable])
  return (
    <button
      type="button"
      className="ap-ic"
      title="Notifications"
      aria-label={
        unavailable ? 'Notifications. The unread count could not load.' : unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
      }
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={onToggle}
    >
      <FqIcon name="nudge" />
      {unread > 0 && <i />}
    </button>
  )
}

function noteIcon(type: string): FqIconName {
  if (/friend|follow|connect/.test(type)) return 'contacts'
  if (/event|rsvp|ticket/.test(type)) return 'event'
  if (/badge|achievement|award|streak|rank/.test(type)) return 'standing'
  if (/zap|gem/.test(type)) return 'zap'
  if (/message|comment|reply|mention/.test(type)) return 'message'
  if (/circle/.test(type)) return 'circle'
  return 'nudge'
}

/** shell.js's Notifications sheet (`.rr-h` heading, `.ap-note` rows), filled with the viewer's own. */
export function BellSheet() {
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(true)
  const busy = useRef(false)
  const mounted = useRef(false)
  const load = useCallback(async () => {
    if (!mounted.current || busy.current) return
    busy.current = true
    try {
      const res = await getMyNotifications()
      if (!mounted.current) return
      if (res.kind === 'error') { setFailed(true); return }
      setItems(res.items)
      // A failed read must never mark unseen notifications read or clear their count.
      if (bellUnread > 0) {
        await markAllRead()
        if (mounted.current) setBellUnread(0)
      }
    } catch {
      if (mounted.current) setFailed(true)
    } finally {
      busy.current = false
      if (mounted.current) setPending(false)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    // Begin after the effect commits; synchronous transport throws also enter the safe async path.
    void Promise.resolve().then(load)
    return () => { mounted.current = false }
  }, [load])

  return (
    <>
      <div className="rr-h">
        <span className="h3">Notifications</span>
        <Link href="/settings#notifications" className="t2">
          Manage
        </Link>
      </div>
      {failed && <div className="ap-note"><p role="alert">Notifications could not load or update. Please try again.</p><Button type="button" size="sm" disabled={pending} onClick={() => { setPending(true); setFailed(false); void load() }}>Retry notifications</Button></div>}
      {!failed && items === null && <p className="ap-note" role="status">Loading…</p>}
      {items && items.length === 0 && <p className="ap-note" role="status">You&rsquo;re caught up.</p>}
      {items?.map((n) => (
        <Link key={n.id} href={notificationHref(n)} className={n.read_at ? 'ap-note' : 'ap-note unread'}>
          <FqIcon name={noteIcon(n.type)} />
          <span>
            <span>
              {n.actor ? `${n.actor.display_name} ` : ''}
              {n.body}
            </span>
            <span className="t2">{relativeTime(n.created_at)}</span>
          </span>
        </Link>
      ))}
    </>
  )
}
