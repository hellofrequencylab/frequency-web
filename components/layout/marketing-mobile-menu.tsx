'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { SITE_NAV, DISCOVER_NAV, BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// Mobile nav for the public marketing header. The desktop PrimaryNav is
// `hidden md:flex`, so phones had no way to reach How-it-works / The Lab /
// Pricing / About / Discover — only the Join CTA. This hamburger opens a
// full-width sheet with the full splash nav + Discover links + sign-in/join.
export function MarketingMobileMenu({ light }: { light: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`rounded-lg p-2 transition-colors ${
          light ? 'text-text hover:bg-surface-elevated' : 'text-white hover:bg-white/10'
        }`}
      >
        <Menu className="h-6 w-6" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-x-0 top-0 rounded-b-2xl bg-surface p-4 pt-4 shadow-pop">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="-mr-1 rounded-lg p-2 text-muted transition-colors hover:bg-surface-elevated"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <nav className="flex flex-col" aria-label="Site">
              {SITE_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-border py-3 text-base font-semibold text-text"
                >
                  {item.label}
                </Link>
              ))}
              <p className="pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-subtle">
                Discover
              </p>
              {DISCOVER_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="py-2.5 text-base text-text"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border py-2.5 text-center text-base font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                Sign in
              </Link>
              <Link
                href={BETA_CTA_HREF}
                onClick={() => setOpen(false)}
                className="rounded-xl bg-primary py-2.5 text-center text-base font-bold text-on-primary transition-colors hover:bg-primary-hover"
              >
                {BETA_CTA_LABEL}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
