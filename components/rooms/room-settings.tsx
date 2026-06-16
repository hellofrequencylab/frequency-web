'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Globe, Lock, Trash2 } from 'lucide-react'
import { StudioWindow } from '@/components/studio/studio-window'
import { StudioFooter } from '@/components/studio/kit/studio-footer'
import { Input, Textarea, Label } from '@/components/ui/field'
import { DangerModal } from '@/components/admin/danger-modal'
import { isError } from '@/lib/action-result'
import { updateRoom, deleteRoom } from '@/app/(main)/messages/rooms/actions'

// Room (message board) settings — the room-admin's edit + delete, in the shared Studio popup.
// Edit name / description / visibility (updateRoom), and a type-to-confirm delete (deleteRoom,
// which redirects back to /messages). Only rendered for a room admin (gated server-side too).
export function RoomSettings({
  roomId,
  name,
  description,
  visibility,
}: {
  roomId: string
  name: string
  description: string | null
  visibility: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(name)
  const [d, setD] = useState(description ?? '')
  const [vis, setVis] = useState<'public' | 'private'>(visibility === 'private' ? 'private' : 'public')

  function save() {
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.set('name', n.trim())
      fd.set('description', d.trim())
      fd.set('visibility', vis)
      const r = await updateRoom(roomId, fd)
      if (isError(r)) setError(r.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  function remove() {
    start(async () => {
      await deleteRoom(roomId) // redirects to /messages on success
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated"
      >
        <Settings className="h-3 w-3" /> Settings
      </button>

      {open && (
        <StudioWindow
          open
          onClose={() => setOpen(false)}
          eyebrow="Studio · Board"
          footer={
            <StudioFooter
              left={
                error ? (
                  <span className="text-xs text-danger">{error}</span>
                ) : (
                  <span className="text-xs text-subtle">Changes apply for everyone.</span>
                )
              }
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending || !n.trim()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {pending ? 'Saving…' : 'Save changes'}
              </button>
            </StudioFooter>
          }
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Board name</Label>
              <Input value={n} onChange={(e) => setN(e.target.value)} maxLength={80} placeholder="Name this board" />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={d}
                onChange={(e) => setD(e.target.value)}
                rows={3}
                maxLength={280}
                placeholder="What is this board for?"
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Who can see it</Label>
              <div className="flex gap-2">
                {([
                  ['public', Globe, 'Anyone'],
                  ['private', Lock, 'Invite only'],
                ] as const).map(([v, Icon, lbl]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVis(v)}
                    aria-pressed={vis === v}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      vis === v
                        ? 'border-primary bg-primary-bg text-primary-strong ring-2 ring-primary/30'
                        : 'border-border bg-surface text-muted hover:border-border-strong'
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-bg/40"
              >
                <Trash2 className="h-4 w-4" /> Delete this board
              </button>
              <p className="mt-1.5 text-2xs text-muted">Removes the board and all its messages for everyone.</p>
            </div>
          </div>
        </StudioWindow>
      )}

      <DangerModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this board"
        body={
          <>
            This permanently removes <span className="font-semibold text-text">{name}</span> and every message in
            it, for everyone. This cannot be undone.
          </>
        }
        confirmLabel="Delete board"
        requireTyping={name}
        onConfirm={remove}
      />
    </>
  )
}
