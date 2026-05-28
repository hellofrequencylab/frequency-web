'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Plus, ChevronDown,
  CircleDot, Radio, CalendarDays, Megaphone, Zap, Building2, Network,
} from 'lucide-react'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

interface CreateMenuProps {
  role: CommunityRole
}

/**
 * Admin overview "+ Create" dropdown. Lists every entity the caller's
 * role can create, navigating to the page where the create button
 * lives so they can configure it inline with that page's context.
 */
export function AdminCreateMenu({ role }: CreateMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const canHost   = ['host', 'guide', 'mentor', 'janitor'].includes(role)
  const canGuide  = ['guide', 'mentor', 'janitor'].includes(role)
  const canMentor = ['mentor', 'janitor'].includes(role)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const items: { icon: React.ElementType; label: string; href: string; show: boolean }[] = [
    { icon: CircleDot,    label: 'New Circle',   href: '/admin/circles',     show: canHost },
    { icon: Radio,        label: 'New Channel',  href: '/channels',          show: canHost },
    { icon: CalendarDays, label: 'New Event',    href: '/events',            show: canHost },
    { icon: Megaphone,    label: 'New Dispatch', href: '/broadcast',         show: canHost },
    { icon: Zap,          label: 'New Task',     href: '/admin/crew-tasks',  show: canHost },
    { icon: Building2,    label: 'New Hub',      href: '/admin/hubs',        show: canGuide },
    { icon: Network,      label: 'New Nexus',    href: '/admin/nexuses',     show: canMentor },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
      >
        <Plus className="w-4 h-4" />
        Create
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg z-30 overflow-hidden">
          {items.filter(i => i.show).map(({ icon: Icon, label, href }) => (
            <Link
              key={href + label}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Icon className="w-4 h-4 text-gray-400" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
