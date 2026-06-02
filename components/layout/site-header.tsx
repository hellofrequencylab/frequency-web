import Link from 'next/link'
import Image from 'next/image'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MARKETING_NAV, DISCOVER_NAV } from '@/lib/site'
import { UserMenu, AuthButtons, type UserMenuProfile } from './user-menu'

// ── Public site header ────────────────────────────────────────────────────────
// Used on the landing page and any future public-facing pages.
// For the authenticated app, AppShell handles navigation instead.

interface SiteHeaderProps {
  /** Override auth state. Pass null to force unauthenticated appearance. */
  profile?: UserMenuProfile | null
  /** Visual style: 'light' for white bg, 'dark' for transparent over hero */
  variant?: 'light' | 'dark'
}

export async function SiteHeader({ profile: profileProp, variant = 'light' }: SiteHeaderProps) {
  // Only fetch if caller didn't provide explicit profile
  let profile: UserMenuProfile | null = profileProp ?? null

  if (profileProp === undefined) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // Own-row read via the session client (RLS-covered); see ADR-042.
      const { data } = await supabase
        .from('profiles')
        .select('display_name, handle, avatar_url')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      profile = data ?? null
    }
  }

  const isAuth = !!profile
  const isDark = variant === 'dark'

  // Keep the menu consistent with wherever the visitor came from. A signed-in
  // member gets the same explore nav as the in-app top bar (Discover / Circles /
  // Events / Topics) so the menu doesn't switch out from under them when they
  // step onto a public /discover page. Logged-out visitors keep the marketing
  // nav (How it works / Demo / Pricing …) for conversion.
  const nav = isAuth ? DISCOVER_NAV : MARKETING_NAV

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 h-16 flex items-center gap-3 px-5 sm:px-8 ${
        isDark
          ? 'bg-transparent'
          : 'bg-surface/90 backdrop-blur-md border-b border-border'
      }`}
    >
      {/* Logo */}
      <Link href={isAuth ? '/feed' : '/'} className="shrink-0">
        <Image
          src="/frequency-logo.png"
          alt="Frequency"
          width={963}
          height={170}
          className={`h-7 w-auto ${isDark ? 'invert' : 'dark:invert'}`}
        />
      </Link>

      {/* Primary nav (public pages). Desktop only; mobile relies on the
          prominent Join CTA + footer nav until a drawer ships. Auth-aware: see
          `nav` above. */}
      <nav className="hidden md:flex items-center gap-1 ml-2">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isDark
                ? 'text-white/70 hover:text-white hover:bg-white/10'
                : 'text-muted hover:text-text hover:bg-surface-elevated'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Search pill */}
      <Link
        href={isAuth ? '/search' : '/sign-in'}
        className={`hidden sm:flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          isDark
            ? 'border-white/20 bg-white/10 text-white/60 hover:bg-white/20 hover:text-white/80'
            : 'border-border bg-surface-elevated text-muted hover:border-border-strong'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Search</span>
        <kbd
          className={`text-[10px] rounded px-1 border ${
            isDark
              ? 'border-white/20 text-white/40'
              : 'border-border text-subtle'
          }`}
        >
          ⌘K
        </kbd>
      </Link>

      {/* Mobile search icon */}
      <Link
        href={isAuth ? '/search' : '/sign-in'}
        className={`sm:hidden p-2 rounded-lg transition-colors ${
          isDark
            ? 'text-white/60 hover:text-white hover:bg-white/10'
            : 'text-muted hover:text-text hover:bg-surface-elevated'
        }`}
        aria-label="Search"
      >
        <Search className="w-5 h-5" />
      </Link>

      {/* User menu / auth buttons */}
      {isAuth ? (
        <UserMenu profile={profile} />
      ) : (
        <AuthButtons dark={isDark} />
      )}
    </header>
  )
}
