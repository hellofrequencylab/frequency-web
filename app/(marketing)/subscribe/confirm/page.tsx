import type { Metadata } from 'next'
import Link from 'next/link'
import { X } from 'lucide-react'
import { verifyOptinToken } from '@/lib/crm/optin/tokens'
import { ConfirmSubscribeButton } from './confirm-button'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

// The emailed link lands here with ?e=<email>&x=<exp>&t=<token>. We verify the stateless HMAC token
// on load ONLY to decide which state to render (a friendly retry for a bad/expired link, or the
// confirm button for a valid one) — we DO NOT flip consent here. Opting in is an AFFIRMATIVE action:
// the flip to 'subscribed' happens only on the "Confirm subscription" POST (confirm-button.tsx →
// confirmSubscribe), never on GET render, so a link scanner or inbox prefetcher can never auto-confirm.
export default async function SubscribeConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; x?: string; t?: string }>
}) {
  const { e, x, t } = await searchParams
  const email = (e || '').trim().toLowerCase()
  const exp = Number(x)
  const tokenOk = !!email && !!t && verifyOptinToken(email, exp, t)

  return (
    <section className="px-6 py-28 sm:py-32">
      <div className="max-w-md mx-auto text-center">
        {tokenOk ? (
          <ConfirmSubscribeButton e={email} x={x as string} t={t as string} />
        ) : (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-danger-bg text-danger flex items-center justify-center mb-6">
              <X className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              This link didn&apos;t work.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              It may have expired or been mistyped. Enter your email again and we&apos;ll send a
              fresh confirm link.
            </p>
            <Link
              href="/subscribe"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              Send a new link
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
