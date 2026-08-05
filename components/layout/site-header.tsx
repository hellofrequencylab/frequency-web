import Link from 'next/link'
import Image from 'next/image'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UserMenu, AuthButtons, type UserMenuProfile } from './user-menu'
import { PrimaryNav } from './primary-nav'
import { ViewerAuthSlot, ViewerLink, ViewerPrimaryNav } from './viewer-chrome'
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
  /** WHERE the viewer is resolved.
   *
   *  'server' (default) reads auth during render — correct for routes that are dynamic anyway.
   *
   *  'client' skips the auth read entirely and renders the ANONYMOUS shell, letting the member's
   *  own chrome swap in after hydration from /api/viewer. Reading auth during render is a dynamic
   *  API, and one anywhere in a layout opts the whole route out of static rendering: this header
   *  was force-dynamicking all 22 public /discover pages and silently voiding their
   *  `export const revalidate = 3600`, so every visitor and every crawler paid two auth round
   *  trips plus the page's full query set on every hit. Use 'client' on trees that should be
   *  statically rendered; the HTML a crawler gets is the anonymous view either way. */
  authMode?: 'server' | 'client'
}

/** Search targets /search for a member and /sign-in for a visitor. On the client-auth path the
 *  swap happens after hydration; otherwise it is decided here during render. */
function SearchLink({
  clientAuth,
  isAuth,
  className,
  'aria-label': ariaLabel,
  children,
}: {
  clientAuth: boolean
  isAuth: boolean
  className?: string
  'aria-label'?: string
  children: React.ReactNode
}) {
  if (clientAuth) {
    return (
      <ViewerLink anonHref="/sign-in" authHref="/search" className={className} aria-label={ariaLabel}>
        {children}
      </ViewerLink>
    )
  }
  return (
    <Link href={isAuth ? '/search' : '/sign-in'} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}

export async function SiteHeader({ profile: profileProp, variant = 'light', authMode = 'server' }: SiteHeaderProps) {
  const clientAuth = authMode === 'client'
  // Only fetch if caller didn't provide explicit profile
  let profile: UserMenuProfile | null = profileProp ?? null
  // The viewer's role/staff axes for the menu (only known on the self-fetch path; an
  // explicitly-passed profile carries no role, so a logged-in viewer reads as a baseline
  // 'member' below). Used to resolve per-item menu modes.
  let communityRole: CommunityRole | null = null
  let webRole: ReturnType<typeof asWebRole> = 'none'

  // `clientAuth` short-circuits the auth read — that read is the dynamic API that would opt the
  // whole route out of static rendering. The menu fetches below stay on the server: they are plain
  // data reads, not dynamic APIs, so they cache with the page.
  if (profileProp === undefined && !clientAuth) {
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
      {/* Skip link — first focusable element, visually hidden until a keyboard user tabs to it,
          so they can jump past the nav to the page's <main id="main"> (WCAG 2.4.1 Bypass Blocks).
          Pointer users never see it. Mirrors the MarketingHeader pattern. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-body-sm focus:font-semibold focus:text-text focus:shadow-pop"
      >
        Skip to content
      </a>

      {/* Logo */}
      {clientAuth ? (
        <ViewerLink anonHref="/" authHref="/feed" className="shrink-0">
          <Image
            src="/frequency-logo.png"
            alt="Frequency"
            width={963}
            height={170}
            className={`h-7 w-auto ${isDark ? 'invert' : 'dark:invert'}`}
          />
        </ViewerLink>
      ) : (
        <Link href={isAuth ? '/feed' : '/'} className="shrink-0">
          <Image
            src="/frequency-logo.png"
            alt="Frequency"
            width={963}
            height={170}
            className={`h-7 w-auto ${isDark ? 'invert' : 'dark:invert'}`}
          />
        </Link>
      )}

      {/* Header mega-menu (from the `header` surface). Desktop only; mobile relies on
          the prominent CTA + footer nav until a drawer ships. */}
      {clientAuth ? (
        <ViewerPrimaryNav
          variant={isDark ? 'dark' : 'light'}
          className="ml-2"
          headerMenu={headerMenu}
          timings={menuTimings}
        />
      ) : (
        <PrimaryNav
          variant={isDark ? 'dark' : 'light'}
          className="ml-2"
          headerMenu={headerMenu}
          viewerRole={viewerRole}
          timings={menuTimings}
        />
      )}

      <div className="flex-1" />

      {/* Search pill */}
      <SearchLink
        clientAuth={clientAuth}
        isAuth={isAuth}
        className={`hidden sm:flex items-center gap-2 rounded-lg border px-3 py-1.5 text-body-sm transition-colors ${
          isDark
            ? 'border-on-ink/20 bg-on-ink/10 text-on-ink-muted hover:bg-on-ink/20 hover:text-on-ink'
            : 'border-border bg-surface-elevated text-muted hover:border-border-strong'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Search</span>
        <kbd
          className={`text-3xs rounded px-1 border ${
            isDark
              ? 'border-on-ink/20 text-on-ink-subtle'
              : 'border-border text-muted'
          }`}
        >
          ⌘K
        </kbd>
      </SearchLink>

      {/* Mobile search icon */}
      <SearchLink
        clientAuth={clientAuth}
        isAuth={isAuth}
        className={`sm:hidden p-2 rounded-lg transition-colors ${
          isDark
            ? 'text-on-ink-muted hover:text-on-ink hover:bg-on-ink/10'
            : 'text-muted hover:text-text hover:bg-surface-elevated'
        }`}
        aria-label="Search"
      >
        <Search className="w-5 h-5" />
      </SearchLink>

      {/* Profile menu / auth buttons */}
      {clientAuth ? (
        <ViewerAuthSlot dark={isDark} profileMenu={profileMenu} />
      ) : isAuth ? (
        <UserMenu profile={profile} menu={profileMenu} />
      ) : (
        <AuthButtons dark={isDark} />
      )}
    </header>
  )
}
