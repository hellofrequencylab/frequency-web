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
}: {
  placeholder?: string
  paramKey?: string
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
        className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-9 text-sm text-text placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); push('') }}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
