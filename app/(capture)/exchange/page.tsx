import type { Metadata } from 'next'
import { parseLeadLink, isSafeHttpUrl } from '@/lib/crm/lead-links'
import { loadSpaceName } from '@/lib/crm/capture-context'
import { CaptureShell } from '@/components/crm/leads/capture-shell'
import { CaptureForm } from '@/components/crm/leads/capture-form'
import { captureExchange } from './actions'

// FRONT DOOR #5 — reciprocal share-back. Someone shares their card; the visitor shares theirs back and
// gets the card in return. A simple two-way handshake. Not a subscription, so it never promises email.
// Noindex (transactional).
export const metadata: Metadata = {
  title: 'Swap details',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

export default async function ExchangePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const payload = parseLeadLink(t)

  if (!payload || payload.d !== 'share_back') {
    return (
      <CaptureShell
        title="This link didn't work."
        description="It may have expired. Ask them to share it again."
      >
        <span className="sr-only">Invalid exchange link.</span>
      </CaptureShell>
    )
  }

  const spaceName = await loadSpaceName(payload.s)
  const who = payload.by?.trim() || spaceName
  const profileLink = isSafeHttpUrl(payload.r)

  return (
    <CaptureShell
      eyebrow={who}
      title="Swap details."
      description={`${who} shared their card. Share yours back and you'll both have each other's.`}
    >
      {payload.l?.trim() && (
        <p className="mb-5 rounded-xl border border-border bg-canvas p-4 text-sm text-muted">
          {payload.l.trim()}
          {profileLink && (
            <>
              {' '}
              <a
                href={payload.r as string}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary-strong hover:underline"
              >
                See their page
              </a>
            </>
          )}
        </p>
      )}
      <CaptureForm
        token={t as string}
        submit={captureExchange}
        submitLabel="Share mine back"
        showPhone
        consentNote={<>This just trades contact details. You&apos;re not signing up for anything.</>}
      />
    </CaptureShell>
  )
}
