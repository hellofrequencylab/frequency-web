'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/field'

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
  // The in-flight state. This control WRITES THE URL and the results come back from the server, so
  // between the debounce firing and the new page committing there is a window where the list on
  // screen belongs to the previous query — and an empty result and a pending one looked exactly
  // alike. A Field does not owe `loading` per INTERACTION-STATES §2, but §1 applies to anything
  // that fetches, and this fetches. `useTransition` around the navigation is the repo's idiom for
  // it (components/admin/menu/menu-surface-picker.tsx): `router.replace` inside a transition keeps
  // `isPending` true until the new server content is ready to commit.
  const [isPending, startTransition] = useTransition()

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
    startTransition(() => router.replace(s ? `${pathname}?${s}` : pathname))
  }

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => push(next), 250)
  }

  return (
    // `aria-busy` on the wrapper is the region-level half of INTERACTION-STATES §1 "loading": it
    // tells assistive tech the content under this control is mid-update, so a stale count is not
    // read out as the answer.
    <div className="relative" aria-busy={isPending || undefined}>
      {/* The leading glyph IS the cue, swapped in place. Same 16px box in the same absolute slot,
          so nothing moves and the field cannot change width while a query is in flight (§4 rule 3)
          — the reason this is not a spinner appended beside the box. `motion-reduce:animate-none`
          is §3's guard; the icon still changes, so the cue survives without the spin. */}
      {isPending ? (
        <Loader2
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-subtle motion-reduce:animate-none"
        />
      ) : (
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      )}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        className="py-2.5 pl-10 pr-9"
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
      {/* A spinning glyph says nothing to a screen reader, and `aria-busy` is a property rather
          than an announcement. This is the spoken half, and it is the pattern the repo already
          uses beside a pending navigation (menu-surface-picker's "Switching surface…"). It sits
          out of the flow, so it adds no height whether it is speaking or silent. */}
      <span className="sr-only" role="status">
        {isPending ? 'Searching…' : ''}
      </span>
    </div>
  )
}
