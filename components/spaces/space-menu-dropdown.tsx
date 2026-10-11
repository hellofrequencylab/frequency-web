'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// A DROPDOWN in the Space page menu (lib/spaces/site-menu.ts): the website header's mega panel in the
// app's look. The child links (each with its line of description) beside an optional photo card.
//
// The menu row is a horizontal scroll rail (overflow-x: auto), which would clip a panel positioned
// inside it, so the panel is `position: fixed` and placed under the button when it opens. A click or
// tap toggles it; Escape, a click outside, or scrolling the page closes it. No router hooks, so the
// signed-out ISR page can render it (closed) on the server.

export function SpaceMenuDropdown({ tab, itemClassName }: { tab: SpaceProfileTab; itemClassName: string }) {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(0)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!button.current?.contains(t) && !panel.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const mega = tab.mega
  if (!mega) return null
  const toggle = () => {
    if (!open && button.current) setTop(button.current.getBoundingClientRect().bottom + 8)
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={cn(itemClassName, 'inline-flex items-center gap-1.5', open && 'bg-surface-elevated text-text')}
      >
        {tab.label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div ref={panel} id={id} className="fixed inset-x-4 z-30 mx-auto max-w-5xl sm:inset-x-6" style={{ top }}>
          <div
            className={cn(
              'grid gap-3 rounded-card border border-border bg-surface p-3 lift-3',
              mega.feature && 'md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]',
            )}
          >
            <div className="grid content-center gap-1 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))]">
              {mega.links.map((l) => (
                <MenuAnchor
                  key={`${l.href}:${l.label}`}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-1 rounded-control px-4 py-3 text-text transition-colors hover:bg-surface-elevated"
                >
                  <span className="font-display text-body-lg leading-tight">{l.label}</span>
                  {l.desc && <span className="text-body-sm text-muted">{l.desc}</span>}
                </MenuAnchor>
              ))}
            </div>
            {mega.feature && (
              <MenuAnchor
                href={mega.feature.href}
                onClick={() => setOpen(false)}
                className="relative flex min-h-36 flex-col justify-end gap-1 overflow-hidden rounded-control bg-ink px-5 py-4 text-on-ink"
              >
                {mega.feature.img && (
                  // eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host
                  <img
                    src={mega.feature.img}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: mega.feature.pos ?? 'center' }}
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-ink/80 to-ink/5" aria-hidden />
                <span className="relative font-display text-lead leading-tight">{mega.feature.title}</span>
                {mega.feature.desc && <span className="relative text-body-sm text-on-ink-muted">{mega.feature.desc}</span>}
              </MenuAnchor>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** A Space path soft-navigates like the tabs beside it; anything else is a plain link, new tab when off-site. */
function MenuAnchor({ href, className, onClick, children }: { href: string; className: string; onClick: () => void; children: React.ReactNode }) {
  const external = /^https:\/\//i.test(href)
  return (
    <a href={href} className={className} onClick={onClick} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
    </a>
  )
}
