'use client'

import { useState, useRef, useEffect, useTransition, useId } from 'react'
import { MoreVertical, Shield, ShieldOff, UserX, Loader2 } from 'lucide-react'
import { promoteRoomMember, demoteRoomMember, removeFromRoom } from '@/app/(main)/messages/rooms/actions'
import { Button } from '@/components/ui/button'

export function MemberRowActions({
  roomId,
  memberId,
  isAdmin,
  memberName,
}: {
  roomId: string
  memberId: string
  isAdmin: boolean
  memberName?: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() }
    }
    if (open) ref.current?.querySelector<HTMLButtonElement>('[role=group] button')?.focus()
    if (open) document.addEventListener('mousedown', onClick)
    if (open) document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  function handle(action: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update this member.')
      }
    })
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <Button
        type="button" variant="ghost" size="sm" disabled={isPending}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setError(null); setOpen(v => !v) }}
        className="min-h-11 min-w-11"
        aria-label={memberName ? `Member actions for ${memberName}` : 'Member actions'}
        aria-expanded={open} aria-controls={menuId}
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
      </Button>

      {open && (
        <div id={menuId} role="group" aria-label="Room member actions" className="absolute right-0 top-full mt-1 w-40 rounded-card border border-border bg-surface lift-3 z-30 overflow-hidden">
          {isAdmin ? (
            <button
              type="button" disabled={isPending}
              onClick={(e) => { e.preventDefault(); handle(() => demoteRoomMember(roomId, memberId)) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-meta text-text hover:bg-surface-elevated transition-colors"
            >
              <ShieldOff className="w-3.5 h-3.5 text-subtle" /> Remove admin
            </button>
          ) : (
            <button
              type="button" disabled={isPending}
              onClick={(e) => { e.preventDefault(); handle(() => promoteRoomMember(roomId, memberId)) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-meta text-text hover:bg-surface-elevated transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-primary-strong" /> Make admin
            </button>
          )}
          <button
            type="button" disabled={isPending}
            onClick={(e) => { e.preventDefault(); handle(() => removeFromRoom(roomId, memberId)) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-meta text-danger hover:bg-danger-bg transition-colors border-t border-border"
          >
            <UserX className="w-3.5 h-3.5" /> Remove from room
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
    </div>
  )
}
