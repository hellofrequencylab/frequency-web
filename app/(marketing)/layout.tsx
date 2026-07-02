import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { getMenu, getMenuSettings } from '@/lib/menus/read'

// Shared chrome for the public marketing content pages (/the-lab, /how-it-works,
// /about). Solid light header (these are content pages, not a dark hero). The
// root splash (app/page.tsx) renders its own header over the hero.
//
// PERF (Phase D): this layout must NOT read `cookies()`/`getUser()`. Those are Request-time
// APIs, and (without Cache Components) a single use here opts EVERY child marketing page out of
// static/ISR rendering — silently defeating the `revalidate = 3600` those pages already declare.
// The pages themselves read no request data, so dropping the server auth read here lets them
// prerender (○ static / ● ISR) again. The only auth-dependent chrome is the header's logo link +
// nav mode, which MarketingHeader now upgrades client-side (detectClientAuth) after hydration —
// the page body + SEO are identical for signed-in and signed-out viewers.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // DB-backed nav megas (lib/menus); fall back to code defaults on any miss, so safe
  // pre-migration. These are non-request reads (admin client, no cookies), so they prerender
  // with the page. The public marketing surface is always a logged-out 'visitor'.
  const [headerMenu, footerMenu, menuTimings] = await Promise.all([
    getMenu('header'),
    getMenu('footer'),
    getMenuSettings(),
  ])
  return (
    <>
      <MarketingHeader headerMenu={headerMenu} menuTimings={menuTimings} detectClientAuth />
      {/* Spacer clears the now-taller fixed header (4rem + safe-area-inset-top); min-h-dvh
          tracks the iOS dynamic toolbar so landscape height doesn't glitch. */}
      <main id="main" className="min-h-dvh bg-surface" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>{children}</main>
      <MarketingFooter menu={footerMenu} />
    </>
  )
}
