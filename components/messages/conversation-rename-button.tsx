'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { renameConversation } from '@/app/(main)/messages/actions'

export function ConversationRenameButton({
  conversationId,
  currentName,
}: {
  conversationId: string
  currentName: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentName ?? '')
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      try {
        await renameConversation(conversationId, value)
        setEditing(false)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to rename')
      }
    })
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setEditing(false); setValue(currentName ?? '') }
          }}
          placeholder="Group name (or blank to clear)"
          autoFocus
          disabled={isPending}
          className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-0.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 max-w-[200px]"
        />
        <button onClick={save} disabled={isPending} className="p-0.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 rounded">
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { setEditing(false); setValue(currentName ?? '') }}
          className="p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="p-1 rounded text-gray-300 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label="Rename"
    >
      <Pencil className="w-3 h-3" />
    </button>
  )
}
