'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Plus,
  Home,
  Megaphone,
  CalendarDays,
  Radio,
  Hash,
} from 'lucide-react'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const HOST_PLUS: CommunityRole[] = ['host', 'guide', 'mentor', 'janitor']

const CREATE_OPTIONS = [
  { href: '/feed', icon: Home, label: 'Post', desc: 'Share with your circle', minRole: 'crew' as CommunityRole },
  { href: '/feed?announce=true', icon: Megaphone, label: 'Announcement', desc: 'Pin to the top of the feed', minRole: 'host' as CommunityRole },
  { href: '/events/new', icon: CalendarDays, label: 'Event', desc: 'Schedule a gathering', minRole: 'crew' as CommunityRole },
  { href: '/broadcast?compose=true', icon: Radio, label: 'Dispatch', desc: 'Broadcast to your audience', minRole: 'host' as CommunityRole },
  { href: '/channels/new', icon: Hash, label: 'Channel', desc: 'Create a discussion channel', minRole: 'host' as CommunityRole },
]

export function ComposeButton({ role }: { role: CommunityRole }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const roleIndex = (r: CommunityRole) => ['member', 'crew', 'host', 'guide', 'mentor', 'janitor'].indexOf(r)
  const viewerIndex = roleIndex(role)
  const visible = CREATE_OPTIONS.filter((o) => viewerIndex >= roleIndex(o.minRole))

  if (visible.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Create</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-xl p-2 z-50">
          {visible.map((opt) => (
            <Link
              key={opt.href}
              href={opt.href}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
            >
              <opt.icon className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{opt.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
