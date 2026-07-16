import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { verifyOptinToken } from '@/lib/crm/optin/tokens'
import { confirmOptin } from '@/lib/crm/optin/store'
import { getRootSpaceId } from '@/lib/crm/import/store'
import { sendOptinWelcomeEmail } from '@/lib/email'
import { buildSpaceUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false },
}

// A GET confirm: the emailed link lands here with ?e=<email>&x=<exp>&t=<token>. Verifying the
// stateless HMAC token proves we issued it; confirmOptin does the idempotent consent flip. A first
// confirmation also sends the welcome email once, with a working per-contact unsubscribe link.
export default async function SubscribeConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; x?: string; t?: string }>
}) {
  const { e, x, t } = await searchParams
  const email = (e || '').trim().toLowerCase()
  const exp = Number(x)
  const tokenOk = !!email && !!t && verifyOptinToken(email, exp, t)

  const result = tokenOk
    ? await confirmOptin(email)
    : ({ status: 'invalid' as const, firstConfirmation: false, profileId: null, displayName: null })

  // Send the welcome email exactly once, only on a brand-new confirmation. Best-effort: a queue
  // hiccup never changes what the confirmed person sees on the page.
  if (result.status === 'confirmed' && result.firstConfirmation) {
    try {
      const rootId = await getRootSpaceId()
      const unsubscribeUrl = rootId
        ? buildSpaceUnsubscribeUrl({ baseUrl: SITE_URL.replace(/\/$/, ''), spaceId: rootId, email })
        : `${SITE_URL.replace(/\/$/, '')}/unsubscribe`
      await sendOptinWelcomeEmail({ to: email, firstName: result.displayName, unsubscribeUrl })
    } catch (err) {
      console.error('[subscribe] welcome email failed to queue:', err)
    }
  }

  const confirmed = result.status === 'confirmed'

  return (
    <section className="px-6 py-28 sm:py-32">
      <div className="max-w-md mx-auto text-center">
        {confirmed ? (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-success-bg text-success flex items-center justify-center mb-6">
              <Check className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              You&apos;re on the list.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              That&apos;s it. You&apos;ll hear from Daniel a few times a month, notes on Circles,
              practices, and events. Every email has a one-click unsubscribe if it ever stops being
              worth your inbox.
            </p>
            <Link
              href="/"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              Back to Frequency
            </Link>
          </>
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
