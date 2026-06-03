'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Megaphone, Zap } from 'lucide-react'

export type TickerItem = {
  id: string
  title: string
  authorName: string | null
  timeLabel: string
  linked: boolean
}

// The community news ticker — a slim "dispatch bar" pinned above the page content.
// One headline at a time, advancing on a gentle timer (paused on hover and under
// prefers-reduced-motion). The label jumps to all broadcasts; each headline jumps
// to its dispatch. Ambient awareness, not navigation.
export function DispatchTicker({ items }: { items: TickerItem[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (items.length <= 1 || paused) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), 5000)
    return () => window.clearInterval(id)
  }, [items.length, paused])

  // Keep the index valid if the item set shrinks between renders.
  const current = items[index] ?? items[0]
  if (!current) return null

  return (
    <div
      className="sticky top-0 z-20 flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-6 backdrop-blur-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link
        href="/broadcast"
        className="flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-signal-strong transition-colors hover:text-primary-strong"
      >
        <Megaphone className="h-3.5 w-3.5" />
        Broadcasts
      </Link>

      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

      {/* Rotating headline — aria-live so the change is announced politely. */}
      <Link
        href={`/broadcast/${current.id}`}
        aria-live="polite"
        className="group flex min-w-0 flex-1 items-center gap-2 text-sm transition-colors"
      >
        {current.linked
          ? <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
          : <Megaphone className="h-3.5 w-3.5 shrink-0 text-subtle" />}
        <span className="truncate font-medium text-text group-hover:text-primary-strong">
          {current.title}
        </span>
        <span className="hidden shrink-0 text-xs text-subtle sm:inline">
          {current.authorName ? `${current.authorName} · ` : ''}{current.timeLabel}
        </span>
      </Link>

      {/* Position dots — only when there's more than one to cycle. */}
      {items.length > 1 && (
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              aria-label={`Show dispatch ${i + 1} of ${items.length}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === index ? 'bg-primary' : 'bg-border-strong hover:bg-subtle'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
