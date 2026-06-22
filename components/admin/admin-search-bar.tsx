'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, ArrowRight } from 'lucide-react'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import { visibleLinks } from '@/app/(main)/admin/sections'

// The admin command bar above the content: an inline search FIELD (not a popup) with
// a live suggestion menu of admin areas, plus an "Ask Vera" action. As you type, the
// dropdown filters the role-gated admin catalog (visibleLinks) — so it only ever
// suggests surfaces the viewer can actually reach. Enter jumps to the top hit; the
// last row escalates to the full member/circle/event search (the ⌘K overlay, via the
// 'open-search' event). Ask Vera opens the assistant ('open-vera').

interface Props {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}

export function AdminSearchBar({ role, webRole = 'none', staffRole = null }: Props) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const links = useMemo(() => visibleLinks(role, webRole, staffRole), [role, webRole, staffRole])

  const suggestions = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    const starts: typeof links = []
    const contains: typeof links = []
    for (const l of links) {
      const label = l.label.toLowerCase()
      if (label.startsWith(t)) starts.push(l)
      else if (label.includes(t) || l.desc.toLowerCase().includes(t)) contains.push(l)
    }
    return [...starts, ...contains].slice(0, 7)
  }, [q, links])

  // Close the menu on an outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const reset = () => {
    setOpen(false)
    setQ('')
  }
  const openVera = () => window.dispatchEvent(new CustomEvent('open-vera'))
  const openFullSearch = () => {
    window.dispatchEvent(new CustomEvent('open-search'))
    reset()
  }

  // The "search everything" row is the last selectable index.
  const lastIndex = suggestions.length

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !q.trim()) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, lastIndex))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = suggestions[active]
      if (active < lastIndex && hit) {
        router.push(hit.href)
        reset()
      } else {
        openFullSearch()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div ref={boxRef} className="relative flex-1">
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 focus-within:border-border-strong">
          <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => q.trim() && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search the admin workspace…"
            aria-label="Search the admin workspace"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle"
          />
        </div>

        {open && q.trim() && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border bg-surface shadow-pop">
            {suggestions.length > 0 ? (
              <ul className="py-1">
                {suggestions.map((l, i) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={reset}
                      onMouseEnter={() => setActive(i)}
                      className={`flex items-center gap-2.5 px-3 py-2 text-sm ${
                        i === active ? 'bg-surface-elevated' : 'hover:bg-surface-elevated'
                      }`}
                    >
                      <l.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-text">{l.label}</span>
                        <span className="block truncate text-2xs text-subtle">{l.desc}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-subtle">No admin areas match “{q.trim()}”.</p>
            )}

            <button
              type="button"
              onClick={openFullSearch}
              onMouseEnter={() => setActive(lastIndex)}
              className={`flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-primary-strong ${
                active === lastIndex ? 'bg-surface-elevated' : 'hover:bg-surface-elevated'
              }`}
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                Search members, circles &amp; events for “{q.trim()}”
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={openVera}
        aria-label="Ask Vera"
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-2.5 text-sm font-bold text-primary-strong transition-colors hover:bg-primary/15 sm:px-3.5"
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        {/* Label collapses to an icon button on phones so the row never clips. */}
        <span className="hidden sm:inline">Ask Vera</span>
      </button>
    </div>
  )
}
