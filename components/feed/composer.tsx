'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import { createPost } from '@/app/(main)/feed/actions'

type HandleResult = { id: string; handle: string; display_name: string; avatar_url: string | null }

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number>(0)
  const [suggestions, setSuggestions] = useState<HandleResult[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setSuggestions([])
      setMentionQuery(null)
    })
  }

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!q) { setSuggestions([]); return }
      const res = await fetch(`/api/search-handles?q=${encodeURIComponent(q)}`)
      const json = await res.json()
      setSuggestions(json.profiles ?? [])
      setActiveSuggestion(0)
    }, 150)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setBody(val)

    // Detect @mention — find last @ before cursor that has no space after it
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@([a-zA-Z0-9_]*)$/)
    if (match) {
      setMentionStart(cursor - match[0].length)
      setMentionQuery(match[1])
      fetchSuggestions(match[1])
    } else {
      setMentionQuery(null)
      setSuggestions([])
    }
  }

  function insertMention(profile: HandleResult) {
    const textarea = textareaRef.current
    if (!textarea) return
    const before = body.slice(0, mentionStart)
    const after  = body.slice(textarea.selectionStart ?? body.length)
    const newBody = `${before}@${profile.handle} ${after}`
    setBody(newBody)
    setMentionQuery(null)
    setSuggestions([])
    // Restore focus + cursor after the inserted mention
    setTimeout(() => {
      textarea.focus()
      const pos = before.length + profile.handle.length + 2
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveSuggestion(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(suggestions[activeSuggestion])
        return
      }
      if (e.key === 'Escape') {
        setSuggestions([])
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside() { setSuggestions([]); setMentionQuery(null) }
    if (suggestions.length > 0) document.addEventListener('click', handleOutside)
    return () => document.removeEventListener('click', handleOutside)
  }, [suggestions.length])

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 mb-4 relative">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        disabled={isPending}
        className="w-full resize-none bg-transparent text-sm text-gray-900 dark:text-gray-50 placeholder-gray-400 dark:placeholder-gray-600 outline-none leading-relaxed disabled:opacity-60"
      />

      {/* @mention autocomplete dropdown */}
      {suggestions.length > 0 && mentionQuery !== null && (
        <div
          className="absolute left-4 bottom-full mb-1 w-64 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl shadow-black/5 py-1 z-50"
          onMouseDown={e => e.preventDefault()}
        >
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => insertMention(p)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors ${
                i === activeSuggestion
                  ? 'bg-indigo-50 dark:bg-indigo-950/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.display_name} className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {getInitials(p.display_name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-50 truncate">{p.display_name}</p>
                <p className="text-[11px] text-gray-400 truncate">@{p.handle}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[11px] text-gray-400">⌘↵ to post · @ to mention</p>
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
