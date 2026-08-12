import { WizardModal } from '@/components/studio/wizard-modal'
import NewEventPage from '@/app/(main)/events/new/page'

// /events/new as a modal. See `(.)circles/new/page.tsx` for the mechanism (ADR-1017).
// `searchParams` is forwarded verbatim — `?circle=`, `?space=`, `?duplicate=` and `?journey=` all
// change what the destination builds, and the modal must not be a narrower door than the page.

export const dynamic = 'force-dynamic'

export default function EventSparkModal({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string; space?: string; duplicate?: string; journey?: string }>
}) {
  return (
    <WizardModal eyebrow="Studio · Event" ariaLabel="Create an event">
      <NewEventPage searchParams={searchParams} />
    </WizardModal>
  )
}
