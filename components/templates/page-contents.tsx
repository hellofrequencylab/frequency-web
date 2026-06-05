'use client'

import { useEffect, useRef, useState } from 'react'

// A reusable in-page "table of contents" — a sticky, horizontally-scrollable bar
// of the page's sections that jumps to them and tracks the active one as you scroll
// (scroll-spy). Drop it at the top of any long index page (Channels, Circles,
// practices…) by passing the section ids already rendered on the page:
//
//   <PageContents sections={[{ id: 'channel-mind', label: 'Mind', count: 6 }, …]} />
//
// The sections themselves are plain server-rendered elements with matching `id`s,
// so this is purely additive navigation. Sticks under the app header; full-bleed
// within the page's padding. Mobile-first (the bar scrolls; the page doesn't jump).

export type PageContentsSection = { id: string; label: string; count?: number }

export function PageContents({ sections }: { sections: PageContentsSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sections.length === 0) return
    const root = document.querySelector('[data-feed-scroll]') as HTMLElement | null
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el)
    if (els.length === 0) return

    const io = new IntersectionObserver(
      (entries) => {
        // The topmost section currently in the activation band wins.
        const inBand = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (inBand[0]) setActive(inBand[0].target.id)
      },
      // Activate a section once it reaches the upper third of the scroll area.
      { root, rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sections])

  // Keep the active chip scrolled into view within the bar.
  useEffect(() => {
    if (!active || !barRef.current) return
    const chip = barRef.current.querySelector<HTMLElement>(`[data-toc="${active}"]`)
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [active])

  if (sections.length < 2) return null

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <nav
      aria-label="On this page"
      className="sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-canvas/90 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6"
    >
      <div ref={barRef} className="flex gap-1.5 overflow-x-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const on = active === s.id
          return (
            <button
              key={s.id}
              type="button"
              data-toc={s.id}
              onClick={() => go(s.id)}
              aria-current={on ? 'true' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-elevated text-muted hover:text-text'
              }`}
            >
              {s.label}
              {s.count != null && (
                <span className={`text-xs tabular-nums ${on ? 'text-on-primary/80' : 'text-subtle'}`}>{s.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
