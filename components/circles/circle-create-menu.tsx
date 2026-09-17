'use client'

import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronDown, CalendarPlus, Megaphone, PenLine } from 'lucide-react'

// ── THE CIRCLE HEADER'S ONE PRIMARY ACTION (owner ruling, 2026-09-17) ───────────────────────────
//
// *"Remove: Post. Move Create to the header. Make Leave group a subtle setting somewhere else and
// not a primary button."*
//
// This was `CircleHostMenu`, a host-only dropdown that sat FOURTH in a row of five buttons, behind
// Post, Edit and Manage. It is now the Circle's single primary action and it is no longer host-only,
// which is what let the Post button go: posting did not lose its door, it moved inside this one.
//
// 🔴 WHY "NEW POST" IS IN HERE AND NOT JUST ON THE PAGE. The composer already renders at the top of
// the Feed tab, so on that tab the old Post button was a link to something three inches below it.
// It was NOT redundant anywhere else: from Members, What's On or Circle Stats there is no composer
// on screen, and removing the button without this item would have left a member on those tabs with
// no way to start a post at all. The item is an anchor to the same `#circle-post` target the old
// button used, so it works identically from every tab.
//
// WHAT EACH VIEWER GETS. A member gets "New post". A manager gets all three. Someone who is neither
// gets no menu at all — the header's primary for them is Join, resolved by the layout, and this
// component renders null rather than an empty dropdown.
//
// The items stay ORDERED by how often they are reached, not by rank: posting is the thing a Circle
// is for, so it leads even though it is the one any member may do.

export function CircleCreateMenu({
  circleId,
  circleSlug,
  canPost,
  canManage,
}: {
  circleId: string
  circleSlug: string
  /** On the roster: may start a post in this Circle. */
  canPost: boolean
  /** Holds `circle.editSettings`: may also book an event and dispatch an announcement. */
  canManage: boolean
}) {
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
    ...(canPost
      ? [
          {
            href: `/circles/${circleSlug}#circle-post`,
            label: 'New post',
            hint: 'Share something with this circle',
            Icon: PenLine,
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            href: `/events/new?circle=${circleId}`,
            label: 'New event',
            hint: 'Gathering for this circle',
            Icon: CalendarPlus,
          },
          {
            href: `/nearby?compose=true&scope=${circleId}`,
            label: 'New announcement',
            hint: 'Dispatch to the wider Hub',
            Icon: Megaphone,
          },
        ]
      : []),
  ]

  // No door to offer. Render nothing rather than a button that opens an empty list.
  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Create"
        aria-expanded={open}
        className={buttonClasses('primary')}
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Create
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-card border border-border bg-surface lift-3 py-1 z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-3xs font-semibold uppercase tracking-wider text-muted">Create</p>
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
                  <p className="text-body-sm font-medium text-text">{label}</p>
                  <p className="text-2xs text-muted leading-tight">{hint}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
