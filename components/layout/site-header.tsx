import Link from 'next/link'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UserMenu, AuthButtons, type UserMenuProfile } from './user-menu'

// ── Public site header ────────────────────────────────────────────────────────
// Used on the landing page and any future public-facing pages.
// For the authenticated app, AppShell handles navigation instead.

interface SiteHeaderProps {
  /** Override auth state — pass null to force unauthenticated appearance. */
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
      const admin = createAdminClient()
      const { data } = await admin
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
          : 'bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-800/60'
      }`}
    >
      {/* Logo */}
      <Link href={isAuth ? '/feed' : '/'} className="shrink-0">
        <img
          src="/frequency-logo.png"
          alt="Frequency"
          className={`h-7 w-auto ${isDark ? 'invert' : 'dark:invert'}`}
        />
      </Link>

      <div className="flex-1" />

      {/* Search pill */}
      <Link
        href={isAuth ? '/search' : '/sign-in'}
        className={`hidden sm:flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          isDark
            ? 'border-white/20 bg-white/10 text-white/60 hover:bg-white/20 hover:text-white/80'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Search</span>
        <kbd
          className={`text-[10px] rounded px-1 border ${
            isDark
              ? 'border-white/20 text-white/40'
              : 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600'
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
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
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
