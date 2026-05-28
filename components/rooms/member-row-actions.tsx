'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { MoreVertical, Shield, ShieldOff, UserX, Loader2 } from 'lucide-react'
import { promoteRoomMember, demoteRoomMember, removeFromRoom } from '@/app/(main)/messages/rooms/actions'

export function MemberRowActions({
  roomId,
  memberId,
  isAdmin,
}: {
  roomId: string
  memberId: string
  isAdmin: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function handle(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action()
        setOpen(false)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed')
      }
    })
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v) }}
        className="p-1 rounded text-subtle hover:text-muted hover:bg-border-strong transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Member actions"
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-surface shadow-lg z-30 overflow-hidden">
          {isAdmin ? (
            <button
              onClick={(e) => { e.preventDefault(); handle(() => demoteRoomMember(roomId, memberId)) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text hover:bg-surface-elevated transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5 text-subtle" /> Remove admin
            </button>
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); handle(() => promoteRoomMember(roomId, memberId)) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text hover:bg-surface-elevated transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-primary-strong" /> Make admin
            </button>
          )}
          <button
            onClick={(e) => { e.preventDefault(); handle(() => removeFromRoom(roomId, memberId)) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-danger hover:bg-danger-bg transition-colors border-t border-border"
          >
            <UserX className="w-3.5 h-3.5" /> Remove from room
          </button>
        </div>
      )}
    </div>
  )
}
