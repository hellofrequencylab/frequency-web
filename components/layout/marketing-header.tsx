'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { PrimaryNav } from '@/components/layout/primary-nav'
import { MarketingMobileMenu } from '@/components/layout/marketing-mobile-menu'
import type { MenuSettings, ResolvedMenu } from '@/lib/menus/types'

// Public marketing header. No search box (that's for the community app). When
// `overHero`, it sits transparent over the dark hero and flips to a solid light
// bar once scrolled (so the nav stays readable over light sections). On content
// pages (no dark hero) it's solid light from the top.
//
// The nav megas are the DB-backed menus (lib/menus), fetched in the SERVER layout that
// renders this header and threaded down through to PrimaryNav. They are optional: a
// missing menu falls back to the code default inside PrimaryNav, so the header always
// renders. The public header is always a logged-out 'visitor' for menu purposes.
export function MarketingHeader({
  overHero = false,
  headerMenu,
  menuTimings,
  isAuth = false,
}: {
  overHero?: boolean
  headerMenu?: ResolvedMenu
  menuTimings?: MenuSettings
  /** When the viewer is signed in, the logo points into the app (/feed) instead of the splash. */
  isAuth?: boolean
}) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const light = !overHero || scrolled

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 h-16 flex items-center gap-3 px-5 sm:px-8 transition-colors duration-300 ${
        light ? 'bg-surface/90 backdrop-blur-md border-b border-border' : 'bg-transparent'
      }`}
    >
      {/* Logo — into the app when signed in, to the splash when not. */}
      <Link href={isAuth ? '/feed' : '/'} className="shrink-0">
        <Image
          src="/frequency-logo.png"
          alt="Frequency"
          width={963}
          height={170}
          className={`h-7 w-auto ${light ? 'dark:invert' : 'invert'}`}
        />
      </Link>

      {/* Header mega-menu (Discover + Explore dropdowns, from the `header` surface) */}
      <PrimaryNav
        variant={light ? 'light' : 'dark'}
        className="ml-3"
        headerMenu={headerMenu}
        viewerRole="visitor"
        timings={menuTimings}
      />

      <div className="flex-1" />

      <Link
        href="/sign-in"
        className={`hidden sm:block text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors ${
          light
            ? 'text-muted hover:text-text hover:bg-surface-elevated'
            : 'text-white/75 hover:text-white hover:bg-white/10'
        }`}
      >
        Sign in
      </Link>
      <Link
        href={BETA_CTA_HREF}
        className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
          light
            ? 'bg-primary text-on-primary hover:bg-primary-hover'
            : 'bg-white text-ink hover:bg-white/90'
        }`}
      >
        {BETA_CTA_LABEL}
      </Link>

      {/* Mobile nav (the desktop PrimaryNav is hidden below md). */}
      <MarketingMobileMenu light={light} />
    </header>
  )
}
