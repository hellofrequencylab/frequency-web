import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'

// Shared chrome for the public marketing content pages (/the-lab, /how-it-works,
// /about). Solid light header (these are content pages, not a dark hero). The
// root splash (app/page.tsx) renders its own header over the hero.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main className="min-h-screen bg-surface pt-16">{children}</main>
      <MarketingFooter />
    </>
  )
}
