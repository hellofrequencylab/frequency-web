'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { openTagQuery, referenceToken, type ReferenceKind } from '@/lib/mentions/references'
import { searchTaggableItems } from '@/lib/mentions/search-items-action'

// ONE PICKER FOR @PEOPLE AND #ITEMS (LIVE-2524, LIVE-2525). Attaches to any textarea a message box
// already owns (the Plan comment box, the room composer): typing @ lists the people the caller passes
// in, typing # (two letters or more) lists the Plans, to-dos, events, deals and contacts the member
// can see (searchTaggableItems, row security decides). Picking writes a token
// (lib/mentions/references.ts) at the caret. Arrow keys move, Enter or Tab picks, Escape closes; a
// consumed key calls preventDefault, so a composer that sends on Enter checks defaultPrevented first.

export interface MentionPerson {
  /** The profile id. */
  value: string
  /** The name shown in the list; a trailing "(Space name)" is dropped from the tag itself. */
  label: string
}

interface Option {
  kind: ReferenceKind
  id: string
  label: string
  hint?: string
}

const MAX_SHOWN = 6

/** The name a tag carries: the label without the "(Space name)" a picker adds for context. */
export function tagLabel(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, '').trim() || label
}

export function useTagPicker({
  inputRef,
  value,
  onValueChange,
  people,
  items = true,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onValueChange: (next: string) => void
  people: readonly MentionPerson[]
  /** Offer # for items. Off where a message cannot name an item. */
  items?: boolean
}): {
  readCaret: (text: string) => void
  onKeyDown: (e: Pick<KeyboardEvent<HTMLTextAreaElement>, 'key' | 'preventDefault'>) => void
  onBlur: () => void
  list: ReactNode
  open: boolean
} {
  const [query, setQuery] = useState<ReturnType<typeof openTagQuery>>(null)
  const [active, setActive] = useState(0)
  // Results are kept with the query they answer, so a stale list never shows under a newer query.
  const [found, setFound] = useState<{ q: string; options: Option[] }>({ q: '', options: [] })
  const seq = useRef(0)

  // # looks items up on the server, debounced, and drops a late answer for an older query.
  useEffect(() => {
    if (!items || query?.sigil !== '#' || query.query.length < 2) return
    const q = query.query
    const mine = ++seq.current
    const t = setTimeout(() => {
      searchTaggableItems(q)
        .then((res) => {
          if (seq.current === mine) setFound({ q, options: res.map((r) => ({ kind: r.kind, id: r.id, label: r.label, hint: r.hint })) })
        })
        .catch(() => {
          if (seq.current === mine) setFound({ q, options: [] })
        })
    }, 200)
    return () => clearTimeout(t)
  }, [items, query])

  const options: Option[] = useMemo(() => {
    if (!query) return []
    if (query.sigil === '#') return found.q === query.query ? found.options.slice(0, MAX_SHOWN) : []
    const q = query.query.toLowerCase()
    return people
      .filter((p) => p.label.toLowerCase().startsWith(q) || p.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
      .slice(0, MAX_SHOWN)
      .map((p) => ({ kind: 'profile' as const, id: p.value, label: p.label }))
  }, [query, people, found])
  const open = options.length > 0

  /** Read the open @ or # word at the caret after the text changed. */
  const readCaret = (text: string) => {
    const caret = inputRef.current?.selectionStart ?? text.length
    setQuery(openTagQuery(text, caret))
    setActive(0)
  }

  const pick = (o: Option) => {
    if (!query) return
    const el = inputRef.current
    const caret = el?.selectionStart ?? value.length
    const token = `${referenceToken(o.kind, o.id, o.kind === 'profile' ? tagLabel(o.label) : o.label)} `
    onValueChange(value.slice(0, query.start) + token + value.slice(caret))
    setQuery(null)
    const at = query.start + token.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at, at)
    })
  }

  const onKeyDown = (e: Pick<KeyboardEvent<HTMLTextAreaElement>, 'key' | 'preventDefault'>) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery(null)
    }
  }

  const list = open ? (
    <ul
      role="listbox"
      aria-label={query?.sigil === '#' ? 'Items to link' : 'People to tag'}
      className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-auto rounded-control border border-border bg-surface-elevated py-1 text-body-sm shadow-lg"
      data-mention-list
    >
      {options.map((o, i) => (
        <li
          key={`${o.kind}:${o.id}`}
          role="option"
          aria-selected={i === active}
          className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${i === active ? 'bg-primary-bg text-text' : 'text-muted'}`}
          // Pick on mouse down so the box keeps focus and its caret.
          onMouseDown={(e) => {
            e.preventDefault()
            pick(o)
          }}
        >
          <span className="truncate">{o.label}</span>
          {o.hint && <span className="shrink-0 text-meta text-subtle">{o.hint}</span>}
        </li>
      ))}
    </ul>
  ) : null

  return { readCaret, onKeyDown, onBlur: () => setQuery(null), list, open }
}
