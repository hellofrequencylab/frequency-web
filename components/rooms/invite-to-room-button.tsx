'use client'

import { useState, useTransition, useEffect } from 'react'
import Image from 'next/image'
import { UserPlus, Check, Search } from 'lucide-react'
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

  // Closing resets the modal's contents in this handler rather than an effect,
  // keeping the state updates out of React's render/effect cascade
  // (react-hooks/set-state-in-effect).
  function closeModal() {
    setOpen(false)
    setQuery('')
    setResults([])
    setSelected(null)
    setError(null)
  }

  // Debounced handle search. Results are only rendered while there's a query
  // (see below), so there's no need to clear them synchronously when it empties.
  useEffect(() => {
    if (!query.trim()) return
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search-handles?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults(json.profiles ?? [])
    }, 200)
    return () => clearTimeout(timer)
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
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-bg bg-primary-bg px-3 py-1.5 text-xs font-semibold text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg/50 transition-colors"
      >
        <UserPlus className="w-3.5 h-3.5" />
        Invite member
      </button>

      <CreateModal
        open={open} onClose={closeModal} onSubmit={submit}
        title="Invite to Room" titleIcon={UserPlus} titleIconColor="indigo"
        submitLabel="Invite" pendingLabel="Inviting…"
        submitDisabled={!selected} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Search by name or handle</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" />
            <input
              type="text" value={query} onChange={e => { setQuery(e.target.value); setSelected(null) }}
              placeholder="Start typing…"
              className={`${cmInput} pl-9`}
              autoFocus
            />
          </div>
        </div>

        {query.trim() && results.length > 0 && (
          <div className="rounded-lg border border-border max-h-64 overflow-y-auto divide-y divide-border">
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
                      ? 'bg-primary-bg'
                      : wasInvited
                      ? 'opacity-50'
                      : 'hover:bg-surface-elevated'
                  }`}
                >
                  {r.avatar_url ? (
                    <Image src={r.avatar_url} alt={r.display_name} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-3xs font-semibold flex items-center justify-center shrink-0">
                      {getInitials(r.display_name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text truncate">{r.display_name}</p>
                    <p className="text-2xs text-subtle truncate">@{r.handle}</p>
                  </div>
                  {wasInvited && <Check className="w-4 h-4 text-success shrink-0" />}
                </button>
              )
            })}
          </div>
        )}

        {query && results.length === 0 && (
          <p className="text-xs text-subtle text-center py-4">No matches.</p>
        )}

        {invited.size > 0 && (
          <p className="text-2xs text-success flex items-center gap-1">
            <Check className="w-3 h-3" /> Invited {invited.size} {invited.size === 1 ? 'member' : 'members'}
          </p>
        )}
      </CreateModal>
    </>
  )
}
