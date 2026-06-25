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
      <main className="min-h-screen bg-surface pt-16">{children}</main>
      <MarketingFooter menu={footerMenu} />
    </>
  )
}
