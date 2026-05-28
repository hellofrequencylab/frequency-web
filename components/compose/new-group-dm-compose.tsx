'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
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
  buttonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap',
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-init defaults when modal reopens
  useEffect(() => {
    if (open) {
      setRecipients(defaultRecipients)
      setName(defaultName)
    } else {
      setQuery(''); setResults([]); setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/search-handles?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      setResults((json.profiles ?? []).filter((p: HandleResult) =>
        !recipients.some(r => r.id === p.id)
      ))
    }, 200)
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
        setOpen(false)
        router.push(`/messages/${id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start conversation.')
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <UsersRound className="w-4 h-4" />
        {buttonLabel}
      </button>

      <CreateModal
        open={open} onClose={() => setOpen(false)} onSubmit={submit}
        title="New Group DM" titleIcon={UsersRound} titleIconColor="indigo"
        submitLabel="Start conversation" pendingLabel="Starting…"
        submitDisabled={recipients.length === 0} isPending={isPending} error={error}
      >
        <div>
          <label className={cmLabel}>Name <span className="text-gray-400 font-normal">(optional, auto-generated otherwise)</span></label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Wednesday Crew" className={cmInput} />
        </div>

        <div>
          <label className={cmLabel}>
            People <span className="text-gray-400 font-normal">({recipients.length}/{GROUP_DM_CAP - 1})</span>
          </label>

          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {recipients.map(r => (
                <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 px-2 py-1 text-xs">
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt={r.display_name} className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-indigo-200 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-[8px] font-bold flex items-center justify-center">
                      {getInitials(r.display_name)}
                    </span>
                  )}
                  <span className="font-medium text-indigo-700 dark:text-indigo-300">{r.display_name}</span>
                  <button type="button" onClick={() => removeRecipient(r.id)}
                    className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search name or handle…" className={`${cmInput} pl-9`} />
          </div>
        </div>

        {results.length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
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
    <div className={`flex items-center gap-2.5 w-full px-3 py-2 ${isFriend ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors' : 'opacity-60'}`}>
      {result.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.avatar_url} alt={result.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold flex items-center justify-center shrink-0">
          {getInitials(result.display_name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 truncate">{result.display_name}</p>
        <p className="text-[11px] text-gray-400 truncate">@{result.handle}</p>
      </div>

      {isFriend && (
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 transition-colors"
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
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-700 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 transition-colors"
        >
          <UserPlus className="w-3 h-3" />
          Add Friend
        </button>
      )}
      {(status === 'pending_outgoing' || requested) && (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-800 px-2 py-1 text-[11px] text-gray-400">
          <Clock className="w-3 h-3" />
          Pending
        </span>
      )}
      {status === 'pending_incoming' && (
        <span className="shrink-0 rounded-md border border-amber-200 dark:border-amber-800 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          Accept on profile
        </span>
      )}
    </div>
  )
}
