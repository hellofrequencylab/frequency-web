'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

// The instant search bar that sits inside a MarketHero. Debounce-updates the `q` query param as you
// type; the server page reads `q` and filters its grid, so results update live without a manual submit.
// Preserves any other params (e.g. Classifieds `kind`). Light input styled to sit over the dark hero.
export function MarketSearchBar({ placeholder = 'Search', paramName = 'q' }: { placeholder?: string; paramName?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get(paramName) ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onChange = (v: string) => {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(Array.from(params.entries()))
      if (v.trim()) next.set(paramName, v.trim())
      else next.delete(paramName)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, 250)
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border border-white/40 bg-white/95 py-3 pl-11 pr-4 text-sm text-ink shadow-lg outline-none placeholder:text-ink/50 focus:border-primary focus:ring-2 focus:ring-primary/40"
      />
    </div>
  )
}
