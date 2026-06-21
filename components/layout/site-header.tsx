import Link from 'next/link'
import Image from 'next/image'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UserMenu, AuthButtons, type UserMenuProfile } from './user-menu'
import { PrimaryNav } from './primary-nav'

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

      {/* Unified primary nav (Discover + About dropdowns). Desktop only; mobile
          relies on the prominent CTA + footer nav until a drawer ships. Members
          get the mission-focused About menu. */}
      <PrimaryNav
        variant={isDark ? 'dark' : 'light'}
        showDiscover={!isAuth}
        className="ml-2"
      />

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
          className={`text-3xs rounded px-1 border ${
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
