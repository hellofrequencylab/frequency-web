import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { getMenu, getMenuSettings } from '@/lib/menus/read'

// Shared chrome for the public marketing content pages (/the-lab, /how-it-works,
// /about). Solid light header (these are content pages, not a dark hero). The
// root splash (app/page.tsx) renders its own header over the hero.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // DB-backed nav megas (lib/menus); fall back to code defaults on any miss, so safe
  // pre-migration. The public marketing surface is always a logged-out 'visitor'.
  const [discoverMenu, exploreMenu, footerMenu, menuTimings] = await Promise.all([
    getMenu('public_discover'),
    getMenu('public_explore'),
    getMenu('marketing_footer'),
    getMenuSettings(),
  ])
  return (
    <>
      <MarketingHeader discoverMenu={discoverMenu} exploreMenu={exploreMenu} menuTimings={menuTimings} />
      <main className="min-h-screen bg-surface pt-16">{children}</main>
      <MarketingFooter menu={footerMenu} />
    </>
  )
}
