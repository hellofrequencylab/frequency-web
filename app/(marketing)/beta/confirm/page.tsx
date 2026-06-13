import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBetaToken } from '@/lib/beta-tokens'

export const metadata: Metadata = {
  title: 'Confirm your spot',
  robots: { index: false },
}

async function confirm(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data: existing } = await admin
    .from('contacts')
    .select('id, meta')
    .ilike('email', email)
    .maybeSingle()

  const meta = {
    ...(existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}),
    beta_waitlist: true,
    double_optin: 'confirmed',
    confirmed_at: nowIso,
  }

  if (existing?.id) {
    const { error } = await admin
      .from('contacts')
      .update({ consent_state: 'subscribed', meta, last_seen_at: nowIso, updated_at: nowIso })
      .eq('id', existing.id)
    return !error
  }

  // Edge case: token valid but no row (e.g. record purged) — create it confirmed.
  const { error } = await admin.from('contacts').insert({
    email,
    consent_state: 'subscribed',
    source: 'beta_waitlist',
    meta,
    last_seen_at: nowIso,
  })
  return !error
}

export default async function BetaConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>
}) {
  const { e, t } = await searchParams
  const email = (e || '').trim().toLowerCase()
  const valid = !!email && !!t && verifyBetaToken(email, t)
  const ok = valid ? await confirm(email) : false

  return (
    <section className="px-6 py-28 sm:py-32">
      <div className="max-w-md mx-auto text-center">
        {ok ? (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-success-bg text-success flex items-center justify-center mb-6">
              <Check className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              You&apos;re on the list.
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              Your spot is confirmed. We&apos;re opening the community to a small
              group at a time, and we&apos;ll reach out the moment a spot opens
              for you.
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
              It may have expired or been mistyped. Request a fresh confirmation
              link and we&apos;ll send a new one.
            </p>
            <Link
              href="/beta"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              Join the Beta
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
