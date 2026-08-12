import { WizardModal } from '@/components/studio/wizard-modal'
import MarketSellPage from '@/app/(main)/market/sell/page'

// /market/sell as a modal. See `(.)circles/new/page.tsx` for the mechanism (ADR-1017).
// The destination renders the upgrade wall instead of the Spark for a free member; that wall shows
// inside the window too, which is correct — the answer to "can I sell?" should not depend on how
// the surface was opened.

export const dynamic = 'force-dynamic'

export default function ProductSparkModal() {
  return (
    <WizardModal eyebrow="Studio · Product" ariaLabel="List a product">
      <MarketSellPage />
    </WizardModal>
  )
}
