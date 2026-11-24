'use client'

import { useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'
import { Textarea } from '@/components/ui/field'
import { openMentionQuery, referenceToken } from '@/lib/mentions/references'

// A MESSAGE BOX THAT TAGS PEOPLE WITH @ (LIVE-2524, hub plan 2026-11-24). Typing @ opens a short list
// of the people the caller passes in (the people who can see the item, never a global search), and
// picking one writes a token (lib/mentions/references.ts) into the text: the server reads the id,
// the reader sees a chip. Arrow keys move, Enter or Tab picks, Escape closes; with the list closed,
// Enter is a new line as before, so a box inside a form never submits it.

export interface MentionPerson {
  /** The profile id. */
  value: string
  /** The name shown in the list; a trailing "(Space name)" is dropped from the tag itself. */
  label: string
}

const MAX_SHOWN = 6

/** The name a tag carries: the label without the "(Space name)" a picker adds for context. */
export function tagLabel(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, '').trim() || label
}

export function MentionTextarea({
  value,
  onValueChange,
  people,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (next: string) => void
  people: readonly MentionPerson[]
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    if (!query || people.length === 0) return []
    const q = query.query.toLowerCase()
    return people.filter((p) => p.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.label.toLowerCase().startsWith(q)).slice(0, MAX_SHOWN)
  }, [people, query])
  const open = matches.length > 0

  const readCaret = (text: string, caret: number) => {
    setQuery(openMentionQuery(text, caret))
    setActive(0)
  }

  const pick = (person: MentionPerson) => {
    if (!query) return
    const el = ref.current
    const caret = el?.selectionStart ?? value.length
    const token = `${referenceToken('profile', person.value, tagLabel(person.label))} `
    const next = value.slice(0, query.start) + token + value.slice(caret)
    onValueChange(next)
    setQuery(null)
    const at = query.start + token.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at, at)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(matches[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery(null)
    }
  }

  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={ref}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          onValueChange(e.target.value)
          readCaret(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setQuery(null)}
      />
      {open && (
        <ul
          role="listbox"
          aria-label="People to tag"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-control border border-border bg-surface-elevated py-1 text-body-sm shadow-lg"
          data-mention-list
        >
          {matches.map((p, i) => (
            <li
              key={p.value}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? 'bg-primary-bg text-text' : 'text-muted'}`}
              // Pick on mouse down so the box keeps focus and its caret.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p)
              }}
            >
              {p.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
