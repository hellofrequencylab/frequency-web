'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

// Standardized free-text search for the directories — the primary way to find a
// specific person/circle by name. Debounced, URL-driven (writes the `q` param and
// preserves the rest), so the page stays server-rendered and shareable.
export function DirectorySearch({
  placeholder = 'Search by name…',
  paramKey = 'q',
  disabled = false,
}: {
  placeholder?: string
  paramKey?: string
  /** Not available right now (an index still building, a directory the viewer cannot query
   *  yet). A Field owes a disabled state per docs/INTERACTION-STATES.md §2; this one had none,
   *  so callers had to hide the whole control or leave a live box that went nowhere. */
  disabled?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [value, setValue] = useState(sp.get(paramKey) ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep in sync if the URL changes elsewhere (e.g. back/forward, a facet nav).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(sp.get(paramKey) ?? '')
  }, [sp, paramKey])

  function push(next: string) {
    const params = new URLSearchParams(sp.toString())
    if (next.trim()) params.set(paramKey, next.trim())
    else params.delete(paramKey)
    const s = params.toString()
    router.replace(s ? `${pathname}?${s}` : pathname)
  }

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => push(next), 250)
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        className="w-full rounded-control border border-border bg-surface py-2.5 pl-10 pr-9 text-body-sm text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); push('') }}
          aria-label="Clear search"
          disabled={disabled}
          // No `.press` here: the clear button is centered with `-translate-y-1/2`, and
          // `.press` sets `transform` outright, so a press would drop it half its height.
          // Pressed is expressed by the hover/active color step instead.
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-control p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text active:bg-border-strong/40 disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
