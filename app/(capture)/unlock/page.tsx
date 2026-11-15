import type { Metadata } from 'next'
import { parseLeadLink, isSafeHttpUrl } from '@/lib/crm/lead-links'
import { resourceReceiptEmailEnabled } from '@/lib/crm/lead-magnet-resource-policy'
import { loadSpaceName } from '@/lib/crm/capture-context'
import { CaptureShell } from '@/components/crm/leads/capture-shell'
import { CaptureForm } from '@/components/crm/leads/capture-form'
import { captureUnlock } from './actions'

// FRONT DOOR #4 — the consent-native lead-magnet unlock. A visitor lands here from a Space's shared
// link, leaves their email, and the download IS the opt-in (they are sealed MAILABLE). Noindex: this
// is a transactional capture surface, not a crawl target.
export const metadata: Metadata = {
  title: 'Get it',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const payload = parseLeadLink(t)

  if (!payload || payload.d !== 'lead_magnet') {
    return (
      <CaptureShell
        title="This link didn't work."
        description="It may have expired. Ask whoever shared it to send you a fresh one."
      >
        <span className="sr-only">Invalid capture link.</span>
      </CaptureShell>
    )
  }

  const spaceName = await loadSpaceName(payload.s)
  const magnet = payload.l?.trim() || 'this'
  const hasResource = isSafeHttpUrl(payload.r)
  const offerEmailCopy = hasResource && resourceReceiptEmailEnabled()

  return (
    <CaptureShell
      eyebrow={spaceName}
      title={hasResource ? (payload.l?.trim() ? `Get ${magnet}.` : 'Get it.') : 'Stay in touch.'}
      description={hasResource ? (offerEmailCopy ? 'Leave your email to open it now and request an email copy.' : 'Leave your email to open it now.') : 'Share your details with the people who sent you this link.'}
    >
      <CaptureForm
        token={t as string}
        submit={captureUnlock}
        submitLabel={hasResource ? (offerEmailCopy ? 'Send it to me' : 'Open the resource') : 'Share my details'}
        consentNote={
          <>
            By leaving your email you&apos;ll also get the occasional note from {spaceName}. It&apos;s a
            way to stay in touch, and you can unsubscribe from those notes at any time.
          </>
        }
      />
    </CaptureShell>
  )
}
