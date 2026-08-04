'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'
import { PrimaryNav } from '@/components/layout/primary-nav'
import { MarketingMobileMenu } from '@/components/layout/marketing-mobile-menu'
import type { MenuSettings, ResolvedMenu } from '@/lib/menus/types'
// NOTE: @/lib/supabase/client is deliberately NOT imported here. See the effect below.

// Public marketing header. No search box (that's for the community app). When
// `overHero`, it sits over the hero under a TOP SCRIM (DAWN 2026-08-03: a bright
// sky was eating the chrome regardless of colour — the scrim + the wordmark's
// drop shadow carry the contrast) and flips to a solid light bar once scrolled
// (so the nav stays readable over light sections). On content pages (no dark
// hero) it's solid light from the top.
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
  ctaLabel = BETA_CTA_LABEL,
  detectClientAuth = false,
}: {
  overHero?: boolean
  headerMenu?: ResolvedMenu
  menuTimings?: MenuSettings
  /** When the viewer is signed in, the logo points into the app (/feed) instead of the splash. */
  isAuth?: boolean
  /**
   * Overrides the header CTA label (still routes to BETA_CTA_HREF). The home splash
   * passes "Join the beta" so the front door reads as a beta invite; everywhere else
   * keeps the builder-framed site-wide default ("Start a Circle", see lib/site).
   */
  ctaLabel?: string
  /**
   * Resolve the signed-in state CLIENT-side instead of taking it from the server. The public
   * marketing layout sets this so it no longer needs a server `cookies()`/`getUser()` read —
   * that read opted every marketing page OUT of static/ISR rendering (it defeated their
   * `revalidate`). With this on, the page body prerenders statically and the header simply
   * upgrades the logo link (→ /feed) + nav mode after hydration for a signed-in member. The
   * only auth-dependent chrome here is the logo target + PrimaryNav mode (there is no account
   * menu), so the static default (signed-out) is safe and never changes the page body / SEO.
   */
  detectClientAuth?: boolean
}) {
  const [scrolled, setScrolled] = useState(false)
  // Client-resolved auth: starts from the server value (default signed-out) and, when
  // detectClientAuth is set, upgrades from the local Supabase session cookie (no network
  // round-trip — getSession reads the cookie the SSR client already hydrated).
  const [authed, setAuthed] = useState(isAuth)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Imported LAZILY, and the reason is worth the paragraph. This effect exists to decide
  // ONE link target: whether the wordmark points at /feed or at the marketing home. The
  // static import that used to sit at the top of this file pulled @supabase/supabase-js
  // -- GoTrue, Postgrest, Realtime and Storage, 222KB raw / ~57KB gzip -- into the initial
  // bundle of every public marketing page, to answer a question that changes a href.
  //
  // A dynamic import keeps the behaviour byte-identical (same client, same getSession,
  // same failure handling) and moves the cost off the critical path: the chunk is fetched
  // after paint, and only when `detectClientAuth` is on. Deliberately NOT the cheaper
  // trick of sniffing document.cookie for the `sb-*-auth-token` key -- that hardcodes a
  // Supabase storage-key format into our header, and it would break silently and
  // invisibly (a wrong link, no error) the day that format changes.
  useEffect(() => {
    if (!detectClientAuth) return
    let active = true
    import('@/lib/supabase/client')
      .then(({ createClient }) => createClient().auth.getSession())
      .then(({ data }) => {
        if (active) setAuthed(!!data.session)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [detectClientAuth])

  const light = !overHero || scrolled

  return (
    <header
      // h-16 + top padding by env(safe-area-inset-top) so the fixed bar fills behind the
      // iOS PWA status bar / notch (viewport-fit=cover) instead of rendering under it.
      style={{ height: 'calc(4rem + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
      className={`fixed top-0 inset-x-0 z-50 flex items-center gap-3 px-5 sm:px-8 transition-colors duration-300 ${
        light ? 'bg-surface/90 backdrop-blur-md border-b border-border' : 'bg-gradient-to-b from-ink/60 via-ink/25 to-transparent'
      }`}
    >
      {/* Skip link — first focusable element, visually hidden until a keyboard user
          tabs to it, so they can jump past the nav to the page's <main id="main">
          (WCAG 2.4.1 Bypass Blocks). Pointer users never see it. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-text focus:shadow-pop"
      >
        Skip to content
      </a>

      {/* Logo — into the app when signed in, to the splash when not. */}
      <Link href={authed ? '/feed' : '/'} className="shrink-0">
        <Image
          src="/frequency-logo.png"
          alt="Frequency"
          width={963}
          height={170}
          className={`h-7 w-auto ${light ? 'dark:invert' : 'invert drop-shadow-md'}`}
        />
      </Link>

      {/* Header mega-menu (Discover + Explore dropdowns, from the `header` surface) */}
      <PrimaryNav
        variant={light ? 'light' : 'dark'}
        className="ml-3"
        headerMenu={headerMenu}
        viewerRole="visitor"
        isAuth={authed}
        timings={menuTimings}
      />

      <div className="flex-1" />

      <Link
        href="/sign-in"
        className={`hidden sm:block text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors ${
          light
            ? 'text-muted hover:text-text hover:bg-surface-elevated'
            : 'text-on-ink-muted hover:text-on-ink hover:bg-on-ink/10'
        }`}
      >
        Sign in
      </Link>
      <Link
        href={BETA_CTA_HREF}
        className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
          light
            ? 'bg-primary text-on-primary hover:bg-primary-hover'
            : 'bg-on-ink text-ink hover:bg-on-ink/90'
        }`}
      >
        {ctaLabel}
      </Link>

      {/* Mobile nav (the desktop PrimaryNav is hidden below md). */}
      <MarketingMobileMenu light={light} />
    </header>
  )
}
