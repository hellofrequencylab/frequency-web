import { Suspense } from 'react'
import type { Metadata } from 'next'
import { X } from 'lucide-react'
import { verifyOptinToken } from '@/lib/crm/optin/tokens'
import { Button, Outcome, OutcomeSkeleton } from '@/components/marketing/marketing-ui'
import { ConfirmSubscribeButton } from './confirm-button'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

// SPEED (PAGE-FRAMEWORK §5.3): `searchParams` is read INSIDE the boundary, not at the page level, so
// the marketing chrome paints while the token verification resolves.
export default function SubscribeConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; x?: string; t?: string }>
}) {
  return (
    <Suspense fallback={<OutcomeSkeleton />}>
      <SubscribeConfirmOutcome searchParams={searchParams} />
    </Suspense>
  )
}

// The emailed link lands here with ?e=<email>&x=<exp>&t=<token>. We verify the stateless HMAC token
// on load ONLY to decide which state to render (a friendly retry for a bad/expired link, or the
// confirm button for a valid one) — we DO NOT flip consent here. Opting in is an AFFIRMATIVE action:
// the flip to 'subscribed' happens only on the "Confirm subscription" POST (confirm-button.tsx →
// confirmSubscribe), never on GET render, so a link scanner or inbox prefetcher can never auto-confirm.
async function SubscribeConfirmOutcome({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; x?: string; t?: string }>
}) {
  const { e, x, t } = await searchParams
  const email = (e || '').trim().toLowerCase()
  const exp = Number(x)
  const tokenOk = !!email && !!t && verifyOptinToken(email, exp, t)

  if (tokenOk) return <ConfirmSubscribeButton e={email} x={x as string} t={t as string} />

  return (
    <Outcome
      tone="danger"
      icon={X}
      title={<>This link didn&apos;t work.</>}
      action={<Button href="/subscribe">Send a new link</Button>}
    >
      It may have expired or been mistyped. Enter your email again and we&apos;ll send a fresh confirm
      link.
    </Outcome>
  )
}
