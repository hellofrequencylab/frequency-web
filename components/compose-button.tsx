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
        className="flex items-center gap-1.5 bg-primary text-on-primary rounded-xl px-4 py-2 text-sm font-semibold hover:bg-primary-hover shadow-sm transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Create</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-border bg-surface shadow-xl p-2 z-50">
          {visible.map((opt) => (
            <Link
              key={opt.href}
              href={opt.href}
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-bg dark:hover:bg-primary-bg transition-colors"
            >
              <opt.icon className="w-5 h-5 text-primary-strong mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-text">{opt.label}</p>
                <p className="text-xs text-muted">{opt.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
