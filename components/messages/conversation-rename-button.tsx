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
          className="text-xs rounded border border-border bg-surface px-2 py-0.5 outline-none focus:border-border-strong focus:ring-1 focus:ring-border-strong/30 max-w-[200px]"
        />
        <button onClick={save} disabled={isPending} className="p-0.5 text-success hover:bg-success-bg dark:hover:bg-success-bg/30 rounded">
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { setEditing(false); setValue(currentName ?? '') }}
          className="p-0.5 text-subtle hover:bg-surface-elevated rounded">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="p-1 rounded text-subtle hover:text-muted dark:hover:text-subtle hover:bg-surface-elevated transition-colors"
      aria-label="Rename"
    >
      <Pencil className="w-3 h-3" />
    </button>
  )
}
