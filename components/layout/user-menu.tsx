'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { User, ChevronDown } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { defaultMenu } from '@/lib/menus/defaults'
import { canSeeMenuItem, flattenCategoryTree } from '@/components/layout/menu-role'
import { railIconFor } from '@/components/layout/nav-icons'
import type { MenuAccess, ResolvedItem, ResolvedMenu } from '@/lib/menus/types'
import { SignOutForm } from './sign-out-form'

export type UserMenuProfile = {
  display_name: string
  handle: string
  avatar_url: string | null
}

// ── Unauthenticated buttons ───────────────────────────────────────────────────

export function AuthButtons({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/sign-in"
        className={`text-body-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
          dark
            ? 'text-on-ink-muted hover:text-on-ink hover:bg-on-ink/10'
            : 'text-muted hover:text-text hover:bg-surface-elevated'
        }`}
      >
        Sign in
      </Link>
      <Link
        href={BETA_CTA_HREF}
        className={`rounded-lg px-3 py-1.5 text-body-sm font-semibold transition-colors whitespace-nowrap ${
          dark
            ? 'bg-on-ink text-ink hover:bg-surface-elevated'
            : 'bg-primary text-on-primary hover:bg-primary-hover'
        }`}
      >
        {BETA_CTA_LABEL}
      </Link>
    </div>
  )
}

// ── Authenticated dropdown ────────────────────────────────────────────────────

export function UserMenu({
  profile,
  menu,
  viewerRole = 'member',
}: {
  profile: UserMenuProfile | null
  /** The resolved `profile` menu (lib/menus); its active items render between the fixed
   *  Profile link and Sign out. Falls back to the code default. */
  menu?: ResolvedMenu
  /** Viewer token for resolving each item's mode (an authed account menu is 'member'+). */
  viewerRole?: MenuAccess
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const resolved = menu ?? defaultMenu('profile')
  const viewer = { viewerRole }
  // Each account section (category) → a muted section header + its gated items, child
  // categories flattened in (flattenCategoryTree, so a sub-group's links still render in
  // this one-level menu). Leftover ungrouped rootItems still render (for safety when an
  // operator moved links out of a section). Gate via canSeeMenuItem (the two-axis union).
  const sections = resolved.categories
    .map((cat) => ({ label: cat.label, items: flattenCategoryTree(cat, (it) => canSeeMenuItem(it, viewer)) }))
    .filter((s) => s.items.length > 0)
  const looseItems = resolved.rootItems.filter((it) => canSeeMenuItem(it, viewer))
  const renderItem = (it: ResolvedItem) => {
    const Icon = railIconFor(it.icon)
    return (
      <Link
        key={it.id}
        href={it.href}
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface transition-colors"
      >
        <Icon className="w-4 h-4 text-subtle" />
        {it.label}
      </Link>
    )
  }

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  if (!profile) return <AuthButtons />

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-surface-elevated transition-colors"
        aria-label="User menu"
      >
        {profile.avatar_url ? (
          <Image
            src={avatarSrc(profile.avatar_url)}
            alt={profile.display_name}
            width={28}
            height={28}
            style={avatarFocusStyle(profile.avatar_url)}
            className="w-7 h-7 rounded-pill object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-pill bg-primary-bg text-primary-strong text-meta font-semibold flex items-center justify-center select-none">
            {getInitials(profile.display_name)}
          </div>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-subtle transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-card border border-border bg-surface-elevated lift-3 py-1 z-50">
          {/* Identity */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-body-sm font-semibold text-text truncate">
              {profile.display_name}
            </p>
            <p className="text-meta text-subtle truncate">@{profile.handle}</p>
          </div>

          {/* Profile (fixed, dynamic href) */}
          <div className="py-1">
            <Link
              href={`/people/${profile.handle}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface transition-colors"
            >
              <User className="w-4 h-4 text-subtle" />
              Profile
            </Link>
            {looseItems.map(renderItem)}
          </div>

          {/* The editable profile menu, segmented into labeled sections. */}
          {sections.map((s) => (
            <div key={s.label ?? 'section'} className="border-t border-border py-1">
              {s.label ? (
                <p className="px-3 pt-1 pb-0.5 text-3xs font-semibold uppercase tracking-wider text-muted">
                  {s.label}
                </p>
              ) : null}
              {s.items.map(renderItem)}
            </div>
          ))}

          {/* Sign out */}
          <div className="border-t border-border py-1">
            <SignOutForm
              buttonClassName="flex items-center gap-2.5 px-3 py-2 text-body-sm text-text hover:bg-surface w-full text-left transition-colors"
              iconClassName="w-4 h-4 text-subtle"
            />
          </div>
        </div>
      )}
    </div>
  )
}
