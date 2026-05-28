'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { UserPlus, Check, Search, Loader2 } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { inviteToRoom } from '@/app/(main)/messages/rooms/actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

interface HandleResult {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
}

export function InviteToRoomButton({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HandleResult[]>([])
  const [selected, setSelected] = useState<HandleResult | null>(null)
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery(''); setResults([]); setSelected(null); setError(null)
    }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/search-handles?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults(json.profiles ?? [])
    }, 200)
  }, [query])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        await inviteToRoom(roomId, selected.id)
        setInvited(prev => new Set(prev).add(selected.id))
        setSelected(null)
        setQuery('')
        setResults([])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to invite.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Invite member
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title="Invite to Room" titleIcon={UserPlus} titleIconColor="indigo"
        submitLabel="Invite" pendingLabel="Inviting…"
        submitDisabled={!selected} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Search by name or handle</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" value={query} onChange={e => { setQuery(e.target.value); setSelected(null) }}
              placeholder="Start typing…"
              className={`${cmInput} pl-9`}
              autoFocus
            />
          </div>
        </div>

        {results.length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {results.map(r => {
              const isSelected = selected?.id === r.id
              const wasInvited = invited.has(r.id)
              return (
                <button
                  key={r.id} type="button"
                  disabled={wasInvited}
                  onClick={() => setSelected(r)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/30'
                      : wasInvited
                      ? 'opacity-50'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt={r.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold flex items-center justify-center shrink-0">
                      {getInitials(r.display_name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 truncate">{r.display_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">@{r.handle}</p>
                  </div>
                  {wasInvited && <Check className="w-4 h-4 text-green-500 shrink-0" />}
                </button>
              )
            })}
          </div>
        )}

        {query && results.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No matches.</p>
        )}

        {invited.size > 0 && (
          <p className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> Invited {invited.size} {invited.size === 1 ? 'member' : 'members'}
          </p>
        )}
      </CreateModal>
    </>
  )
}
