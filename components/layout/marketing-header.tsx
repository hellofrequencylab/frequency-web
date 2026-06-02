'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MARKETING_NAV, DISCOVER_NAV, BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// Discover/Explore links first, then the story pages (drop MARKETING_NAV's own
// "Discover" so it isn't duplicated).
const HEADER_NAV = [
  ...DISCOVER_NAV,
  ...MARKETING_NAV.filter((i) => i.href !== '/discover'),
]

// Public marketing header. No search box (that's for the community app). When
// `overHero`, it sits transparent over the dark hero and flips to a solid light
// bar once scrolled (so the nav stays readable over light sections). On content
// pages (no dark hero) it's solid light from the top.
export function MarketingHeader({ overHero = false }: { overHero?: boolean }) {
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
      {/* Logo */}
      <Link href="/" className="shrink-0">
        <Image
          src="/frequency-logo.png"
          alt="Frequency"
          width={963}
          height={170}
          className={`h-7 w-auto ${light ? 'dark:invert' : 'invert'}`}
        />
      </Link>

      {/* Nav */}
      <nav className="hidden md:flex items-center gap-1 ml-3">
        {HEADER_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              light
                ? 'text-muted hover:text-text hover:bg-surface-elevated'
                : 'text-white/75 hover:text-white hover:bg-white/10'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

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
            : 'bg-white text-text hover:bg-white/90'
        }`}
      >
        {BETA_CTA_LABEL}
      </Link>
    </header>
  )
}
