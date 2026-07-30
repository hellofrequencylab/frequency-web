import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Check, X } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBetaToken } from '@/lib/beta-tokens'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { Button, Outcome, OutcomeSkeleton } from '@/components/marketing/marketing-ui'

export const metadata: Metadata = {
  title: 'Confirm your spot',
  robots: { index: false },
}

async function confirm(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  // ROOT-scoped: the beta waitlist lives on the root hub (→ root via the contacts_default_space_id
  // trigger). Per-space tenancy (ADR-624) makes an unscoped email lookup a multi-row throw hazard.
  const rootId = await loadRootSpaceId()
  const { data: existing } = rootId
    ? await admin.from('contacts').select('id, meta').eq('space_id', rootId).ilike('email', email).maybeSingle()
    : { data: null }

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

// SPEED (PAGE-FRAMEWORK §5.3): the page itself awaits nothing, so the marketing chrome streams
// immediately and only the confirm round-trip sits behind the boundary. Awaiting `searchParams` at the
// page level would hold the whole document until the write returned.
export default function BetaConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>
}) {
  return (
    <Suspense fallback={<OutcomeSkeleton />}>
      <BetaConfirmOutcome searchParams={searchParams} />
    </Suspense>
  )
}

async function BetaConfirmOutcome({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>
}) {
  const { e, t } = await searchParams
  const email = (e || '').trim().toLowerCase()
  const valid = !!email && !!t && verifyBetaToken(email, t)
  const ok = valid ? await confirm(email) : false

  if (ok) {
    return (
      <Outcome
        tone="success"
        icon={Check}
        title={<>You&apos;re on the list.</>}
        action={<Button href="/">Back to Frequency</Button>}
      >
        Your spot is confirmed. We&apos;re opening the community to a small group at a time, and
        we&apos;ll reach out the moment a spot opens for you.
      </Outcome>
    )
  }

  return (
    <Outcome
      tone="danger"
      icon={X}
      title={<>This link didn&apos;t work.</>}
      action={<Button href="/beta">Join the Beta</Button>}
    >
      It may have expired or been mistyped. Request a fresh confirmation link and we&apos;ll send a new
      one.
    </Outcome>
  )
}
