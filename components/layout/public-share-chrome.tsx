import { SiteHeader } from '@/components/layout/site-header'
import { ViewerProvider } from '@/components/layout/viewer-chrome'
import { MarketingFooter } from '@/components/layout/marketing-footer'
import { getMenu } from '@/lib/menus/read'

// Shared public chrome for share URLs that must stay ISR-eligible (SCAN-643).
// Never call cookies() or headers() from here or from a layout that mounts this.
// SiteHeader authMode=client is the SCAN-641 contract (same bar /discover uses).
// Footer stays MarketingFooter: SCAN-641 was the header split, not a footer unification.

export async function PublicShareChrome({ children }: { children: React.ReactNode }) {
  const footerMenu = await getMenu('footer')
  return (
    <ViewerProvider>
      <SiteHeader variant="light" authMode="client" />
      <main
        id="main"
        tabIndex={-1}
        className="min-h-dvh bg-canvas"
        style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}
      >
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
