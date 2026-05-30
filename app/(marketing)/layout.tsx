import { SiteHeader } from '@/components/layout/site-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'

// Shared chrome for the public marketing content pages (/the-lab, /how-it-works,
// /about). Light header (content pages, not the hero splash) + the marketing
// footer. The root splash (app/page.tsx) keeps its own dark hero header.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader profile={null} variant="light" />
      <main className="min-h-screen bg-surface pt-16">{children}</main>
      <MarketingFooter />
    </>
  )
}
