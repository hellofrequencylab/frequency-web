'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { User, ChevronDown } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { BETA_CTA_LABEL, BETA_CTA_HREF, CTA_LABEL_COMPACT } from '@/lib/site'
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
    // `shrink-0`: this rides the fixed public header, whose one flexible child is the wordmark.
    // Unpinned, the pair (178px at full padding) rode straight off the right edge of every
    // /discover page on a phone — and it carries BOTH doors, so nothing here may be clipped.
    //
    // 🔴 NEITHER LINK IS HIDDEN BELOW sm, and that is deliberate rather than an oversight. Hiding
    // Sign in would be the obvious way to buy back ~70px, and it is the wrong one: SiteHeader has
    // no mobile drawer (MarketingMobileMenu belongs to MarketingHeader), and the /discover footer
    // lists Discover / Privacy / Terms / Contact. So a hidden Sign in is not a demoted link, it is
    // the last way back into an account on 22 public pages. The padding tightens on a phone
    // instead, the CTA takes its compact label (below), and the wordmark gives up the rest.
    //
    // 🔴 THIS CLUSTER IS THE REASON THE PHONE LABEL EXISTS. The fit contract next door says one
    // give-way child means a longer CTA label cannot break the bar. That is true of MarketingHeader
    // and it is NOT true here, because this cluster keeps BOTH links below sm: on a 320px screen
    // the fixed row (search glyph + Sign in + this CTA + the menu button + four gaps) already
    // spends the whole line, so past a certain label the wordmark has shrunk to nothing and the
    // deficit lands on the menu button instead. Renaming BETA_CTA_LABEL from 'Start a Circle' to
    // 'Find your people' — two characters — put that button 18px off a 320px /discover viewport
    // (ADR-1196; the @overflow gate caught it, `header-fit.test.ts` now budgets it).
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <Link
        href="/sign-in"
        className={`text-body-sm font-medium px-2 py-1.5 rounded-lg transition-colors sm:px-3 ${
          dark
            ? 'text-on-ink-muted hover:text-on-ink hover:bg-on-ink/10'
            : 'text-muted hover:text-text hover:bg-surface-elevated'
        }`}
      >
        Sign in
      </Link>
      <Link
        href={BETA_CTA_HREF}
        className={`rounded-lg px-2.5 py-1.5 text-body-sm font-semibold transition-colors whitespace-nowrap sm:px-3 ${
          dark
            ? 'bg-on-ink text-ink hover:bg-surface-elevated'
            : 'bg-primary text-on-primary hover:bg-primary-hover'
        }`}
      >
        {/* The compact form below sm, for the reason stated above. Exactly one of the two is
            displayed, so the accessible name is whichever one the viewport shows. */}
        <span className="sm:hidden">{CTA_LABEL_COMPACT}</span>
        <span className="hidden sm:inline">{BETA_CTA_LABEL}</span>
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
        // Same disclosure contract the notification bell now carries: announce that this opens
        // something and whether it is open. It also brings the dropdown into the @overflow
        // gate's overlay pass, which discovers triggers by these two attributes.
        aria-expanded={open}
        aria-haspopup="menu"
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
