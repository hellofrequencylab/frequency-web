import { WizardModal } from '@/components/studio/wizard-modal'
import NewPracticePage from '@/app/(main)/practices/new/page'

// /practices/new as a modal. See `(.)circles/new/page.tsx` for how interception + the slot work
// and why this renders the destination's own page module rather than a twin (ADR-1010).

export const dynamic = 'force-dynamic'

export default function PracticeSparkModal() {
  return (
    <WizardModal eyebrow="Studio · Practice" ariaLabel="Create a practice">
      <NewPracticePage />
    </WizardModal>
  )
}
