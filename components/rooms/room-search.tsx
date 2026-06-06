'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Search, X, Sparkles, Loader2 } from 'lucide-react'
import { searchRoomAction } from '@/app/(main)/messages/rooms/actions'
import { isError } from '@/lib/action-result'
import { relativeTime } from '@/lib/utils'
import type { RoomSearchHit } from '@/lib/ai/room-search'

// Phase C: in-room search. A header button opens a panel; typing runs a semantic
// search over the room's history (substring fallback when AI is off). Results are
// read-only snippets — "find what was discussed", no chatbot.
export function RoomSearch({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<RoomSearchHit[]>([])
  const [mode, setMode] = useState<'semantic' | 'text'>('text')
  const [searched, setSearched] = useState(false)
  const [pending, start] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onClick)
      inputRef.current?.focus()
    }
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function run(e: React.FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (!query || pending) return
    start(async () => {
      const r = await searchRoomAction(roomId, query)
      setSearched(true)
      if (isError(r)) { setHits([]); return }
      setHits(r.data.hits)
      setMode(r.data.mode)
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search this room"
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated"
      >
        <Search className="h-3.5 w-3.5" /> Search
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[85vw] rounded-2xl border border-border bg-surface p-3 shadow-xl shadow-black/5">
          <form onSubmit={run} className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface-elevated/60 px-2.5 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-subtle" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search this room…"
                className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-subtle focus:outline-none"
              />
              {q && (
                <button type="button" onClick={() => { setQ(''); setHits([]); setSearched(false) }} aria-label="Clear">
                  <X className="h-3.5 w-3.5 text-subtle hover:text-text" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={pending || !q.trim()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go'}
            </button>
          </form>

          {searched && (
            <div className="mt-3">
              {hits.length === 0 ? (
                <p className="px-1 py-2 text-xs text-subtle">No matching messages.</p>
              ) : (
                <>
                  <p className="mb-1.5 flex items-center gap-1 px-1 text-2xs font-medium uppercase tracking-wide text-subtle">
                    {mode === 'semantic' ? <><Sparkles className="h-3 w-3 text-primary-strong" /> Closest in meaning</> : 'Matches'}
                    <span className="ml-auto normal-case tracking-normal">{hits.length}</span>
                  </p>
                  <ul className="max-h-72 space-y-1 overflow-y-auto">
                    {hits.map((h) => (
                      <li key={h.id} className="rounded-lg px-2 py-1.5 hover:bg-surface-elevated">
                        <p className="line-clamp-3 text-sm leading-snug text-text">{h.body}</p>
                        <p className="mt-0.5 text-2xs text-subtle">{relativeTime(h.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
