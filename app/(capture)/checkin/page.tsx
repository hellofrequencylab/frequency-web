import type { Metadata } from 'next'
import { parseLeadLink } from '@/lib/crm/lead-links'
import { loadSpaceName } from '@/lib/crm/capture-context'
import { CaptureShell } from '@/components/crm/leads/capture-shell'
import { CaptureForm } from '@/components/crm/leads/capture-form'
import { captureCheckIn } from './actions'

// FRONT DOOR #3 — event / attendance capture. A host points attendees here (a printed QR, a link on
// the screen). Leaving a name + email checks them in and drops them into the Space CRM with the event
// as their entry point. Not marketing consent, so it never promises email. Noindex (transactional).
export const metadata: Metadata = {
  title: 'Check in',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const payload = parseLeadLink(t)

  if (!payload || payload.d !== 'event') {
    return (
      <CaptureShell
        title="This check-in link didn't work."
        description="It may have expired. Ask a host for a fresh one."
      >
        <span className="sr-only">Invalid check-in link.</span>
      </CaptureShell>
    )
  }

  const spaceName = await loadSpaceName(payload.s)
  const eventTitle = payload.w?.trim() || payload.l?.trim() || null

  return (
    <CaptureShell
      eyebrow={spaceName}
      title={eventTitle ? `Check in to ${eventTitle}.` : 'Check in.'}
      description="Leave your name so the host knows you came. That's it."
    >
      <CaptureForm
        token={t as string}
        submit={captureCheckIn}
        submitLabel="Check me in"
        showPhone
        consentNote={
          <>Checking in just tells the host you were here. We won&apos;t add you to any email list for it.</>
        }
      />
    </CaptureShell>
  )
}
