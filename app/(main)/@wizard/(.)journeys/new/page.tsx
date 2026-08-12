import { WizardModal } from '@/components/studio/wizard-modal'
import NewJourneyPage from '@/app/(main)/journeys/new/page'

// /journeys/new as a modal. See `(.)circles/new/page.tsx` for the mechanism (ADR-1010).
// `searchParams` is forwarded verbatim: the Space road is `/journeys/new?space=<slug>`, and the
// destination page reads it to swap the gate from the member tier to managing that Space.

export const dynamic = 'force-dynamic'

export default function JourneySparkModal({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>
}) {
  return (
    <WizardModal eyebrow="Studio · Journey" ariaLabel="Create a Journey">
      <NewJourneyPage searchParams={searchParams} />
    </WizardModal>
  )
}
