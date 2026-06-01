'use client'

import { useState, useTransition, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { UsersRound, Search, X, Clock, UserPlus } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { startGroupConversation } from '@/app/(main)/messages/actions'
import { sendFriendRequest } from '@/app/(main)/people/friend-actions'
import { CreateModal, cmInput, cmLabel } from '@/components/create-modal'

type FriendStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted'

interface HandleResult {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  friend_status?: FriendStatus
}

const GROUP_DM_CAP = 25

export function NewGroupDMCompose({
  buttonLabel = 'New Group DM',
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors whitespace-nowrap',
  defaultRecipients = [],
  defaultName = '',
}: {
  buttonLabel?: string
  buttonClass?: string
  defaultRecipients?: HandleResult[]
  defaultName?: string
} = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<HandleResult[]>([])
  const [recipients, setRecipients] = useState<HandleResult[]>(defaultRecipients)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Opening/closing resets the modal's contents in these handlers rather than in
  // an effect, keeping the state updates out of React's render/effect cascade
  // (react-hooks/set-state-in-effect).
  function openModal() {
    setRecipients(defaultRecipients)
    setName(defaultName)
    setOpen(true)
  }
  function closeModal() {
    setOpen(false)
    setQuery('')
    setResults([])
    setError(null)
  }

  // Debounced handle search. Results are only rendered while there's a query
  // (see below), so there's no need to clear them synchronously when it empties.
  useEffect(() => {
    if (!query.trim()) return
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search-handles?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults((json.profiles ?? []).filter((p: HandleResult) =>
        !recipients.some(r => r.id === p.id)
      ))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, recipients])

  function addRecipient(p: HandleResult) {
    if (recipients.length + 1 >= GROUP_DM_CAP) {
      setError(`Group DMs are capped at ${GROUP_DM_CAP} people`)
      return
    }
    setRecipients(prev => [...prev, p])
    setQuery('')
    setResults([])
    setError(null)
  }

  function removeRecipient(id: string) {
    setRecipients(prev => prev.filter(r => r.id !== id))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (recipients.length === 0 || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        const { id } = await startGroupConversation(
          recipients.map(r => r.id),
          name || null
        )
        closeModal()
        router.push(`/messages/${id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start conversation.')
      }
    })
  }

  return (
    <>
      <button onClick={openModal} className={buttonClass}>
        <UsersRound className="w-4 h-4" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={closeModal} onSubmit={submit}
        title="New Group DM" titleIcon={UsersRound} titleIconColor="indigo"
        submitLabel="Start conversation" pendingLabel="Starting…"
        submitDisabled={recipients.length === 0} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Name <span className="text-subtle font-normal">(optional, auto-generated otherwise)</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Wednesday Crew" className={cmInput} />
        </div>

        <div>
          <label className={cmLabel}>
            People <span className="text-subtle font-normal">({recipients.length}/{GROUP_DM_CAP - 1})</span>
          </label>

          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {recipients.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1 rounded-md bg-primary-bg border border-primary-bg px-2 py-1 text-xs">
                  {r.avatar_url ? (
                    <Image src={r.avatar_url} alt={r.display_name} width={16} height={16} className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-primary-bg dark:bg-primary-bg text-primary-strong text-[8px] font-bold flex items-center justify-center">
                      {getInitials(r.display_name)}
                    </span>
                  )}
                  <span className="font-medium text-primary-strong">{r.display_name}</span>
                  <button type="button" onClick={() => removeRecipient(r.id)}
                    className="text-primary-strong hover:text-primary-strong dark:hover:text-primary-strong">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search name or handle…" className={`${cmInput} pl-9`} />
          </div>
        </div>

        {query.trim() && results.length > 0 && (
          <div className="rounded-lg border border-border max-h-56 overflow-y-auto divide-y divide-border">
            {results.map(r => (
              <ResultRow key={r.id} result={r} onAdd={() => addRecipient(r)} />
            ))}
          </div>
        )}
      </CreateModal>
    </>
  )
}

function ResultRow({
  result,
  onAdd,
}: {
  result: HandleResult
  onAdd: () => void
}) {
  const status: FriendStatus = result.friend_status ?? 'none'
  const [requested, setRequested] = useState(false)
  const [requestPending, startRequest] = useTransition()

  const isFriend = status === 'accepted'

  return (
    <div className={`flex items-center gap-2.5 w-full px-3 py-2 ${isFriend ? 'hover:bg-surface-elevated transition-colors' : 'opacity-60'}`}>
      {result.avatar_url ? (
        <Image src={result.avatar_url} alt={result.display_name} width={28} height={28} className="w-7 h-7 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-[10px] font-semibold flex items-center justify-center shrink-0">
          {getInitials(result.display_name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text truncate">{result.display_name}</p>
        <p className="text-[11px] text-subtle truncate">@{result.handle}</p>
      </div>

      {isFriend && (
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-hover transition-colors"
        >
          Add
        </button>
      )}
      {status === 'none' && !requested && (
        <button
          type="button"
          disabled={requestPending}
          onClick={() => startRequest(async () => {
            await sendFriendRequest(result.id)
            setRequested(true)
          })}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-[11px] font-medium text-muted hover:border-primary hover:text-primary-strong disabled:opacity-50 transition-colors"
        >
          <UserPlus className="w-3 h-3" />
          Add Friend
        </button>
      )}
      {(status === 'pending_outgoing' || requested) && (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-subtle">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      )}
      {status === 'pending_incoming' && (
        <span className="shrink-0 rounded-md border border-warning px-2 py-1 text-[11px] font-medium text-warning">
          Accept on profile
        </span>
      )}
    </div>
  )
}
