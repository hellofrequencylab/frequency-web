'use client'

import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { MessageSquare, Hash, Lock, ArrowRight, Loader2 } from 'lucide-react'
import { getInitials, relativeTime } from '@/lib/utils'
import { fetchMessagesSummary, type MessagesSummary } from '@/app/(main)/messages/popover-actions'

export function MessagesPopover({ initialUnread = 0 }: { initialUnread?: number }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<MessagesSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Fetch data on first open
  useEffect(() => {
    if (!open || data) return
    setLoading(true)
    fetchMessagesSummary()
      .then(d => {
        setData(d)
        setUnread(d.totalUnread)
      })
      .finally(() => setLoading(false))
  }, [open, data])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Messages"
        className="relative p-2 rounded-lg text-muted hover:bg-surface-elevated hover:text-text transition-colors"
      >
        <MessageSquare className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-elevated shadow-xl z-50 overflow-hidden flex flex-col max-h-[70vh]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text">Messages</h3>
            <Link
              href="/messages"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-primary-strong hover:underline flex items-center gap-0.5"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading && !data && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-4 h-4 animate-spin text-subtle" />
              </div>
            )}

            {data && data.rooms.length === 0 && data.conversations.length === 0 && (
              <div className="px-4 py-10 text-center">
                <MessageSquare className="w-7 h-7 text-subtle/60 mx-auto mb-2" />
                <p className="text-xs text-subtle">No messages yet.</p>
              </div>
            )}

            {data && data.rooms.length > 0 && (
              <div className="py-1">
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-subtle">Rooms</p>
                {data.rooms.map(r => (
                  <Link
                    key={r.id}
                    href={`/messages/r/${r.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary-bg flex items-center justify-center shrink-0">
                      {r.visibility === 'private'
                        ? <Lock className="w-3.5 h-3.5 text-primary-strong" />
                        : <Hash className="w-3.5 h-3.5 text-primary-strong" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text truncate">{r.name}</p>
                      {r.last_message_at && (
                        <p className="text-[10px] text-subtle">{relativeTime(r.last_message_at)}</p>
                      )}
                    </div>
                    {r.unread > 0 && (
                      <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center">
                        {r.unread > 9 ? '9+' : r.unread}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {data && data.conversations.length > 0 && (
              <div className="py-1 border-t border-border">
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-subtle">Direct messages</p>
                {data.conversations.map(c => {
                  const isGroup = c.participants.length > 1
                  const display = c.name || (isGroup
                    ? c.participants.slice(0, 3).map(p => p.display_name.split(' ')[0]).join(', ') +
                      (c.participants.length > 3 ? ` +${c.participants.length - 3}` : '')
                    : c.participants[0]?.display_name ?? 'Unknown')
                  const firstAvatar = c.participants[0]
                  return (
                    <Link
                      key={c.id}
                      href={`/messages/${c.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface transition-colors"
                    >
                      {firstAvatar?.avatar_url ? (
                        <Image width={28} height={28} src={firstAvatar.avatar_url} alt={firstAvatar.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-surface-elevated text-muted text-[10px] font-semibold flex items-center justify-center shrink-0 select-none">
                          {firstAvatar ? getInitials(firstAvatar.display_name) : '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs truncate ${c.unread > 0 ? 'font-semibold text-text' : 'font-medium text-text'}`}>
                          {display}
                        </p>
                        {c.lastMessage && (
                          <p className="text-[10px] text-subtle truncate">{c.lastMessage.body}</p>
                        )}
                      </div>
                      {c.unread > 0 && (
                        <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center">
                          {c.unread > 9 ? '9+' : c.unread}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
