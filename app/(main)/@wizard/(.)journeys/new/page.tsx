import { WizardModal } from '@/components/studio/wizard-modal'
import NewJourneyPage from '@/app/(main)/journeys/new/page'

// /journeys/new as a modal. See `(.)circles/new/page.tsx` for the mechanism (ADR-1017).
// `searchParams` is forwarded verbatim: the Space road is `/journeys/new?space=<slug>`, and the
// destination page reads it to swap the gate from the member tier to managing that Space. The
// Production road adds `&plan=<space_plans.id>` (PROG-CAL8); the type below must be widened in
// LOCKSTEP with the destination page's, or the modal silently forwards a parameter it has typed
// away and the Journey loses its Plan on exactly the road that matters.

export const dynamic = 'force-dynamic'

export default function JourneySparkModal({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; plan?: string }>
}) {
  return (
    <WizardModal eyebrow="Studio · Journey" ariaLabel="Create a Journey">
      <NewJourneyPage searchParams={searchParams} />
    </WizardModal>
  )
}
