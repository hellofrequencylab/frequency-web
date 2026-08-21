'use client'

import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { createItemsForRole, type CommunityRole } from './create-actions'

export function CreateMenu({ role }: { role: CommunityRole }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const visible = createItemsForRole(role)
  if (visible.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Create"
        aria-expanded={open}
        className={buttonClasses('primary', 'sm')}
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Create
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-card border border-border bg-surface lift-3 py-1 z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-3xs font-semibold uppercase tracking-wider text-muted">
              Quick Create
            </p>
          </div>
          <div className="py-1">
            {visible.map(({ href, label, hint, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2 hover:bg-surface-elevated transition-colors"
              >
                <Icon className="w-4 h-4 text-subtle mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-text dark:text-subtle/60">{label}</p>
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
