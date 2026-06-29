import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { getMenu, getMenuSettings } from '@/lib/menus/read'
import { createClient } from '@/lib/supabase/server'

// Shared chrome for the public marketing content pages (/the-lab, /how-it-works,
// /about). Solid light header (these are content pages, not a dark hero). The
// root splash (app/page.tsx) renders its own header over the hero.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // DB-backed nav megas (lib/menus); fall back to code defaults on any miss, so safe
  // pre-migration. The public marketing surface is always a logged-out 'visitor'.
  const [headerMenu, footerMenu, menuTimings] = await Promise.all([
    getMenu('header'),
    getMenu('footer'),
    getMenuSettings(),
  ])
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return (
    <>
      <MarketingHeader headerMenu={headerMenu} menuTimings={menuTimings} isAuth={!!user} />
      {/* Spacer clears the now-taller fixed header (4rem + safe-area-inset-top); min-h-dvh
          tracks the iOS dynamic toolbar so landscape height doesn't glitch. */}
      <main className="min-h-dvh bg-surface" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>{children}</main>
      <MarketingFooter menu={footerMenu} />
    </>
  )
}
