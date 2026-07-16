'use client'

import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'

// A small, dependency-free emoji popover. Curated common sets grouped by feel —
// enough to react quickly without shipping a multi-megabyte emoji database. Opens
// from a toolbar button, inserts at the caller's cursor, closes on outside-click
// or Escape.
const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀', '😄', '😁', '😆', '😅', '😂', '🙂', '😊', '😉', '😍', '😘', '😎', '🤩', '🤔', '😴', '😅', '🥲', '😭', '😡', '🥳'],
  },
  {
    label: 'Gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '💪', '👌', '✌️', '🤞', '👋', '🤙', '🤝', '👀', '🫶', '🤗'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💕', '💔', '✨', '⭐', '💯', '🔥'],
  },
  {
    label: 'Life',
    emojis: ['🌸', '🌿', '🌱', '🌳', '🌊', '☀️', '🌙', '🌈', '🍀', '🦋', '☕', '🍵', '🥑', '🍰', '🍷'],
  },
  {
    label: 'Moments',
    emojis: ['🎉', '🎊', '🎈', '🎁', '🏆', '🎯', '🎵', '🚀', '💡', '📌', '✅', '❓', '❗', '👏', '🙏'],
  },
]

export function EmojiPicker({ onSelect, disabled }: { onSelect: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        // Keep the caret in the field that opened the picker (the textarea / subject input): a plain mousedown
        // would blur it, so the emoji insert would lose its selection. preventDefault holds focus; the click
        // still fires and toggles the popover.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Add emoji"
        aria-expanded={open}
        className={`inline-flex items-center rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
          open ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:bg-surface-elevated hover:text-muted'
        }`}
        title="Add emoji"
      >
        <Smile className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 max-h-64 w-72 overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-xl shadow-black/5"
          // Don't let clicks bubble to the textarea's blur / outside handlers.
          onMouseDown={(e) => e.preventDefault()}
        >
          {GROUPS.map((group) => (
            <div key={group.label} className="mb-1.5 last:mb-0">
              <p className="px-1.5 pb-1 pt-1 text-3xs font-semibold uppercase tracking-wide text-subtle">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji, i) => (
                  <button
                    key={`${group.label}-${i}`}
                    type="button"
                    onClick={() => {
                      onSelect(emoji)
                      setOpen(false)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-lg leading-none transition-colors hover:bg-surface-elevated"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
