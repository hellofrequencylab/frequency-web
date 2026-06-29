import Link from 'next/link'
import Image from 'next/image'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UserMenu, AuthButtons, type UserMenuProfile } from './user-menu'
import { PrimaryNav } from './primary-nav'
import { getMenu, getMenuSettings } from '@/lib/menus/read'
import { viewerRoleFor } from '@/components/layout/menu-role'
import { asWebRole, type CommunityRole } from '@/lib/core/roles'

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
  // The viewer's role/staff axes for the menu (only known on the self-fetch path; an
  // explicitly-passed profile carries no role, so a logged-in viewer reads as a baseline
  // 'member' below). Used to resolve per-item menu modes.
  let communityRole: CommunityRole | null = null
  let webRole: ReturnType<typeof asWebRole> = 'none'

  if (profileProp === undefined) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // Own-row read via the session client (RLS-covered); see ADR-042. Pull the role
      // axes alongside the identity so the public explore mega resolves per-role modes.
      const { data } = await supabase
        .from('profiles')
        .select('display_name, handle, avatar_url, community_role, web_role')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      profile = data ?? null
      communityRole = (data?.community_role ?? null) as CommunityRole | null
      webRole = asWebRole(data?.web_role)
    }
  }

  const isAuth = !!profile
  const isDark = variant === 'dark'

  // DB-backed nav megas (lib/menus); getMenu/getMenuSettings fall back to the code defaults
  // on any miss, so these are safe pre-migration and the header always renders.
  const [headerMenu, profileMenu, menuTimings] = await Promise.all([
    getMenu('header'),
    getMenu('profile'),
    getMenuSettings(),
  ])
  const viewerRole = viewerRoleFor({ loggedIn: isAuth, communityRole, webRole })

  return (
    <header
      // h-16 + top padding by env(safe-area-inset-top) so the fixed bar fills behind the
      // iOS PWA status bar / notch (viewport-fit=cover) instead of rendering under it.
      style={{ height: 'calc(4rem + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
      className={`fixed top-0 inset-x-0 z-50 flex items-center gap-3 px-5 sm:px-8 ${
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

      {/* Header mega-menu (from the `header` surface). Desktop only; mobile relies on
          the prominent CTA + footer nav until a drawer ships. */}
      <PrimaryNav
        variant={isDark ? 'dark' : 'light'}
        className="ml-2"
        headerMenu={headerMenu}
        viewerRole={viewerRole}
        timings={menuTimings}
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

      {/* Profile menu / auth buttons */}
      {isAuth ? (
        <UserMenu profile={profile} menu={profileMenu} />
      ) : (
        <AuthButtons dark={isDark} />
      )}
    </header>
  )
}
