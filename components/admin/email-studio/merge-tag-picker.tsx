'use client'

import { useEffect, useRef, useState } from 'react'
import { Braces, Check, Copy } from 'lucide-react'
import { MERGE_TAG_VARIABLES, MERGE_TAG_DEFAULT_FALLBACKS } from '@/lib/email-studio/types'

// MERGE-TAG PICKER. A small dropdown of the curated merge variables (lib/email-studio/types). Picking one
// types its `{{ token | "fallback" }}` text into the field the operator was in, at the cursor (the menu keeps
// focus where it was by cancelling mousedown, so the field's selection survives the click). When no field is
// focused, it copies the tag to the clipboard instead. The token carries its default fallback where one exists,
// so a nameless recipient still reads naturally.

/** Build the insertable token text for a variable, e.g. `{{ contact.first_name | "there" }}`. */
export function mergeTagText(token: string): string {
  const fallback = MERGE_TAG_DEFAULT_FALLBACKS[token]
  return fallback ? `{{ ${token} | "${fallback}" }}` : `{{ ${token} }}`
}

/** Type `text` at the cursor of the focused input, textarea or rich slot. False when no editable holds focus. */
export function insertAtCursor(text: string): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    el.setRangeText(text, start, end, 'end')
    // setRangeText bypasses React's value setter; the bubbling input event is what fires onChange.
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }
  if (el.isContentEditable) return document.execCommand('insertText', false, text)
  return false
}

export function MergeTagPicker({ onInsert = insertAtCursor }: { onInsert?: (text: string) => boolean } = {}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function pick(token: string) {
    const text = mergeTagText(token)
    if (onInsert(text)) {
      setOpen(false)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(token)
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1600)
    } catch {
      // Clipboard blocked (permissions / insecure context): leave the menu open so the operator can select
      // the visible token text manually.
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text"
      >
        <Braces className="h-3.5 w-3.5" aria-hidden /> Merge tags
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-64 rounded-card border border-border bg-surface p-1 lift-3"
        >
          <p className="px-2.5 py-1.5 text-3xs font-semibold uppercase tracking-wide text-muted">
            Click a tag to put it where your cursor is
          </p>
          {MERGE_TAG_VARIABLES.map((v) => {
            const isCopied = copied === v.token
            return (
              <button
                key={v.token}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(v.token)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface-elevated"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta font-semibold text-text">{v.label}</span>
                  <span className="block truncate font-mono text-3xs text-muted">{mergeTagText(v.token)}</span>
                </span>
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
