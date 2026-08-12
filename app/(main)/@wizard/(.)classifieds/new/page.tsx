import { WizardModal } from '@/components/studio/wizard-modal'
import NewListingPage from '@/app/(main)/classifieds/new/page'

// /classifieds/new as a modal. See `(.)circles/new/page.tsx` for the mechanism (ADR-1010).

export const dynamic = 'force-dynamic'

export default function ListingSparkModal() {
  return (
    <WizardModal eyebrow="Studio · Listing" ariaLabel="Post a listing">
      <NewListingPage />
    </WizardModal>
  )
}
