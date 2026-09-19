import { MarketingFooter } from '@/components/layout/marketing-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { ViewerProvider } from '@/components/layout/viewer-chrome'
import { getMenu } from '@/lib/menus/read'

// Sitemap-advertised share URLs that used to live under (main) (SCAN-643 / ADR-1442).
// The member layout reads the session cookie and the request path before its public
// chrome. Without cacheComponents, one dynamic API in a parent voids the subtree —
// the sentence app/discover/layout.tsx and app/(marketing)/layout.tsx already paid
// to learn. This group does neither. Auth chrome is SiteHeader authMode=client
// (SCAN-641), same as /discover. Space profiles stay under (main) because their
// own layout calls getMyProfileId (SCAN-644).

export default async function PublicShareLayout({ children }: { children: React.ReactNode }) {
  const footerMenu = await getMenu('footer')
  return (
    <ViewerProvider>
      <SiteHeader variant="light" authMode="client" />
      <main id="main" className="min-h-dvh bg-canvas" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>
        <div className="mx-auto flex w-full max-w-[105rem] items-stretch gap-8 px-4 sm:px-6 lg:gap-10 lg:px-8">
          <div className="hidden w-48 shrink-0 md:block" aria-hidden />
          <div className="min-w-0 flex-1 py-6">{children}</div>
          <div className="hidden w-72 shrink-0 lg:block" aria-hidden />
        </div>
      </main>
      <MarketingFooter menu={footerMenu} />
    </ViewerProvider>
  )
}
