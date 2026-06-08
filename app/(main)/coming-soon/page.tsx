import { Hammer } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'

export const dynamic = 'force-dynamic'

// Placeholder for menu items that are in the IA (the owner's Roles & Permissions sheet)
// but whose page isn't built yet — Website, Hook Network, Studio Finances, Financial
// Dashboard, Status. Keeps the full menu present + gated while the destinations ship.
const FEATURES: Record<string, { title: string; blurb: string }> = {
  website: { title: 'Website', blurb: 'A hosted website builder for partner businesses and organizations.' },
  hook: { title: 'Hook Network', blurb: 'A private sub-community network for organizations, on Hook.' },
  finances: { title: 'Finances', blurb: 'Earnings & commissions for partners — payouts and statements.' },
  financials: { title: 'Financial Dashboard', blurb: 'The platform financial dashboard (owner / Janitor).' },
  status: { title: 'Status', blurb: 'A live platform status dashboard.' },
}

export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>
}) {
  const { feature } = await searchParams
  const f = (feature && FEATURES[feature]) || { title: 'Coming soon', blurb: 'This area is on the roadmap and not built yet.' }

  return (
    <FocusTemplate width="narrow" title={f.title} description="Coming soon">
      <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg">
          <Hammer className="h-6 w-6 text-primary-strong" />
        </div>
        <h2 className="text-lg font-bold text-text">{f.title} is coming soon</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{f.blurb}</p>
        <p className="mt-4 text-xs text-subtle">It’s in the menu so the structure is final; the page lands in a later build.</p>
      </div>
    </FocusTemplate>
  )
}
