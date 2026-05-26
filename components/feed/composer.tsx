'use client'

import { useState, useTransition } from 'react'
import { createPost } from '@/app/(main)/feed/actions'

export function Composer({
  scopeId,
  visibility = 'group',
  placeholder = 'Share something with your group…',
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
}) {
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    const trimmed = body.trim()
    if (!trimmed || isPending) return

    const fd = new FormData()
    fd.set('body', trimmed)
    fd.set('scopeId', scopeId)
    fd.set('visibility', visibility)

    startTransition(async () => {
      await createPost(fd)
      setBody('')
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        }}
        placeholder={placeholder}
        rows={3}
        disabled={isPending}
        className="w-full resize-none text-sm text-gray-900 placeholder-gray-400 outline-none leading-relaxed disabled:opacity-60"
      />
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <p className="text-[11px] text-gray-400">⌘↵ to post</p>
        <button
          onClick={submit}
          disabled={!body.trim() || isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  )
}
