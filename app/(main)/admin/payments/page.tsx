import { CreditCard } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { FormSection } from '@/components/admin/form-section'
import { Banner } from '@/components/admin/status'
import { hostPayoutsEnabledFlag } from '@/lib/platform-flags'
import { billingEnabled } from '@/lib/billing/stripe'
import { PayoutsToggle } from './payments-toggle'
import { findPayments, type FoundPayment } from '@/lib/admin/payments-finder'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'
import { Input } from '@/components/ui/field'
import { buttonClasses } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

// The operator switch for the Connect payout marketplace (ADR-178). Host payouts —
// tips, paid event tickets, and the future store/membership channels — stay OFF until a
// janitor turns them on here. Gated behind the platform flag AND a Stripe key. The
// SETTINGS template (ADR-233 §3.8): annotated FormSection (left copy, right control); the
// toggle autosaves with an inline "Saved".
const KIND: Record<FoundPayment['kind'], string> = { ticket: 'Ticket', donation: 'Donation', order: 'Order' }

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

// Staff answer "where is that payment?" here (LIVE-2547): every ticket, donation and shop order
// across every Space, newest first, narrowed by a Stripe payment id, a guest email or a buyer name.
function PaymentRow({ p }: { p: FoundPayment }) {
  const when = new Date(p.at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  })
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-payment-kind={p.kind}>
      <div className="min-w-0 grow">
        <p className="truncate text-body-sm font-medium text-text">{p.title}</p>
        <p className="truncate text-meta text-muted">
          {KIND[p.kind]} · {p.buyer ?? 'Guest'} · {p.spaceName ?? 'No Space'} · {when} · {p.status === 'refunded' ? 'Refunded' : 'Paid'}
        </p>
        {p.stripePaymentIntentId && <p className="truncate text-2xs text-subtle">{p.stripePaymentIntentId}</p>}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-right text-body-sm">
          <span className="font-semibold text-text">{money(p.amountCents, p.currency)}</span>
          <span className="block text-2xs text-muted">fee {money(p.feeCents, p.currency)}</span>
        </span>
        {p.spaceSlug && (
          <Link href={`/spaces/${p.spaceSlug}/settings/shop?tab=orders`} className={buttonClasses('ghost', 'sm')}>
            Space orders
          </Link>
        )}
        {p.stripePaymentIntentId && (
          <a
            href={`https://dashboard.stripe.com/payments/${p.stripePaymentIntentId}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClasses('ghost', 'sm')}
          >
            Stripe
          </a>
        )}
      </div>
    </li>
  )
}

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin('janitor')
  const q = ((await searchParams).q ?? '').trim()
  const found = await findPayments(q, { limit: 50 })
  const [enabled, stripeConfigured] = [await hostPayoutsEnabledFlag(), billingEnabled()]

  return (
    <AdminTemplate
      title="Payments"
      eyebrow="Operations"
      icon={CreditCard}
      description="Turn host payouts on or off, and find any ticket, donation or order across every Space."
    >
      <AdminSection>
        {enabled && !stripeConfigured && (
          <Banner tone="warning" title="No Stripe key configured">
            Payouts are on but stay dormant until the Stripe keys are set in this environment. Members
            won&rsquo;t see payment controls until both the switch and the keys are live.
          </Banner>
        )}
        <FormSection
          title="Host payouts"
          description="When on, hosts can set up payouts and members can pay them (tips, paid event tickets, and future store/membership sales). When off, none of those controls appear anywhere."
        >
          <PayoutsToggle enabled={enabled} stripeConfigured={stripeConfigured} />
        </FormSection>
      </AdminSection>

      <AdminSection title="Find a payment">
        <form action="/admin/payments" method="get" className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Search payments"
            placeholder="Payment id (pi_...), guest email or buyer name"
            className="min-w-[240px] flex-1 sm:max-w-md"
          />
          <button type="submit" className={buttonClasses('secondary', 'sm')}>
            Search
          </button>
        </form>
        {found.unreadable.length > 0 && (
          <Banner tone="warning" title="This list is partial">
            Could not read: {found.unreadable.join(', ')}. Try again before trusting an empty result.
          </Banner>
        )}
        {found.payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={q ? 'No payment matches that.' : 'No payments yet.'}
            description={
              q
                ? 'Search a member by their name. A member’s sign-in email is not on the sale; a guest’s email is.'
                : 'Tickets, donations and shop orders from every Space list here as they settle.'
            }
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {found.payments.map((p) => (
              <PaymentRow key={`${p.kind}:${p.id}`} p={p} />
            ))}
          </ul>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
