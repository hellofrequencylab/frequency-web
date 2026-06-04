'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronDown, CalendarPlus, Megaphone } from 'lucide-react'

// Header "Create" dropdown for a circle host. Mirrors the global CreateMenu
// convention (primary button + chevron) and replaces the old hard-to-see
// hamburger. Pure management actions (edit info, invite link) live in the
// Host Tools box in the right rail instead.
export function CircleHostMenu({ circleId }: { circleId: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const items = [
    {
      href: `/events/new?circle=${circleId}`,
      label: 'New event',
      hint: 'Gathering for this circle',
      Icon: CalendarPlus,
    },
    {
      href: `/broadcast?compose=true&scope=${circleId}`,
      label: 'New announcement',
      hint: 'Broadcast to the wider hub',
      Icon: Megaphone,
    },
  ]

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Create"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-4 py-2 shadow-sm transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Create
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border bg-surface shadow-xl shadow-black/5 py-1 z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
              Create
            </p>
          </div>
          <div className="py-1">
            {items.map(({ href, label, hint, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2 hover:bg-surface-elevated transition-colors"
              >
                <Icon className="w-4 h-4 text-subtle mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{label}</p>
                  <p className="text-[11px] text-subtle leading-tight">{hint}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
