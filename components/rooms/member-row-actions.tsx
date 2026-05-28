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
        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Member actions"
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg z-30 overflow-hidden">
          {isAdmin ? (
            <button
              onClick={(e) => { e.preventDefault(); handle(() => demoteRoomMember(roomId, memberId)) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5 text-gray-400" /> Remove admin
            </button>
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); handle(() => promoteRoomMember(roomId, memberId)) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-500" /> Make admin
            </button>
          )}
          <button
            onClick={(e) => { e.preventDefault(); handle(() => removeFromRoom(roomId, memberId)) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors border-t border-gray-100 dark:border-gray-800"
          >
            <UserX className="w-3.5 h-3.5" /> Remove from room
          </button>
        </div>
      )}
    </div>
  )
}
