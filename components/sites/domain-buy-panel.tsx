'use client'

import { useState, useTransition } from 'react'
import { Loader2, Search, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/field'
import CheckoutPanel from '@/components/billing/checkout-panel'
import PaymentMarks from '@/components/billing/payment-marks'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { isError } from '@/lib/action-result'
import { formatYearlyPrice, type DomainSearch } from '@/lib/sites/domain-pricing'
import {
  searchDomainToBuy,
  startDomainPurchaseCheckout,
  settleDomainPurchaseAction,
} from '@/app/(main)/spaces/[slug]/manage/layout/domain-purchase-actions'

// BUY A NEW DOMAIN (LIVE-781), the third method in the Domain section. Search a name, see whether it is
// free and its ONE yearly price (Vercel's price plus Frequency's markup, worked out on the server), add
// who the domain is registered to, then pay on this page through the shared checkout (docs/CHECKOUT.md):
// the button names its price, the card form opens under it, the card marks sit below, and a fallback
// demands a hosted session. The server re-quotes before charging and buys the domain only after Stripe
// confirms the payment. Rendered only while domain sales are switched on. DAWN tokens, no em dashes.

type Contact = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  country: string
}

const EMPTY_CONTACT: Contact = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
}

const CONTACT_FIELDS: { key: keyof Contact; label: string; placeholder?: string; autoComplete: string; optional?: boolean }[] = [
  { key: 'firstName', label: 'First name', autoComplete: 'given-name' },
  { key: 'lastName', label: 'Last name', autoComplete: 'family-name' },
  { key: 'email', label: 'Email', autoComplete: 'email' },
  { key: 'phone', label: 'Phone', placeholder: '+1 415 555 0123', autoComplete: 'tel' },
  { key: 'address1', label: 'Street address', autoComplete: 'address-line1' },
  { key: 'address2', label: 'Apartment or suite', autoComplete: 'address-line2', optional: true },
  { key: 'city', label: 'City', autoComplete: 'address-level2' },
  { key: 'state', label: 'State or region', autoComplete: 'address-level1' },
  { key: 'zip', label: 'Postal code', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country code', placeholder: 'US', autoComplete: 'country' },
]

export function DomainBuyPanel({ slug }: { slug: string }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<DomainSearch | null>(null)
  const [buying, setBuying] = useState(false)
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const offer = result?.available ? result : null
  const priceLabel = offer ? formatYearlyPrice(offer.quote.totalCents) : ''

  function search() {
    setError(null)
    setBuying(false)
    setClientSecret(null)
    start(async () => {
      const r = await searchDomainToBuy(slug, query)
      if (isError(r)) {
        setResult(null)
        setError(r.error)
        return
      }
      setResult(r.data)
    })
  }

  function fallBackToHosted() {
    if (!offer) return
    setClientSecret(null)
    setSessionId(null)
    setError('Opening secure checkout…')
    start(async () => {
      const r = await startDomainPurchaseCheckout(slug, offer.domain, offer.quote.totalCents, contact, { forceHosted: true })
      if (!isError(r) && r.data.url) window.location.href = r.data.url
      else setError(isError(r) ? r.error : 'Could not start checkout for this domain. Try again.')
    })
  }

  function pay() {
    if (!offer) return
    setError(null)
    warmStripeBrowser()
    start(async () => {
      const r = await startDomainPurchaseCheckout(slug, offer.domain, offer.quote.totalCents, contact)
      if (isError(r)) {
        setError(r.error)
        return
      }
      // Branch on what came back, never on what was asked for.
      if (r.data.clientSecret) {
        setSessionId(r.data.sessionId ?? null)
        setClientSecret(r.data.clientSecret)
      } else if (r.data.url) window.location.href = r.data.url
    })
  }

  return (
    <div className="mt-6 space-y-3 border-t border-border pt-5">
      <div>
        <p className="text-body-sm font-semibold text-text">Buy a new domain</p>
        <p className="mt-0.5 text-body-sm text-muted">
          Search for a name. If it is free, you see one yearly price before you pay, and it works with nothing to set up.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <Input
          aria-label="Domain to buy"
          placeholder="yourname.com"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending || query.trim().length === 0}>
          {pending && !buying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          Search
        </Button>
      </form>

      {result && !result.available && (
        <p className="text-body-sm text-muted">
          <span className="font-semibold text-text">{result.domain}</span>{' '}
          {result.reason === 'taken'
            ? 'is already taken. Try another name or ending.'
            : 'cannot be bought here. Try a .com, .org or .net name.'}
        </p>
      )}

      {offer && (
        <div className="space-y-3 rounded-card border border-border px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text">{offer.domain}</span>
            <Badge tone="success" size="sm">
              Available
            </Badge>
          </div>
          <p className="text-body-sm text-text">
            <span className="font-semibold">{priceLabel} a year.</span>{' '}
            <span className="text-muted">
              Renews at {formatYearlyPrice(offer.quote.renewalCents)} a year, paid by your Space. It is registered in your name, so the
              domain is yours.
            </span>
          </p>

          {!buying ? (
            <Button type="button" variant="primary" size="sm" onClick={() => setBuying(true)} onPointerEnter={warmStripeBrowser}>
              <ShoppingCart className="h-4 w-4" aria-hidden />
              Buy for {priceLabel} a year
            </Button>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                pay()
              }}
            >
              <p className="text-body-sm text-muted">
                Who is the domain registered to? The registry needs a real name, email, phone and mailing address, and
                may email to confirm them.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CONTACT_FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col gap-1 text-meta font-medium text-muted">
                    {f.optional ? `${f.label} (optional)` : f.label}
                    <Input
                      value={contact[f.key]}
                      placeholder={f.placeholder}
                      autoComplete={f.autoComplete}
                      required={!f.optional}
                      onChange={(e) => setContact((c) => ({ ...c, [f.key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={pending || clientSecret !== null}
                onPointerEnter={warmStripeBrowser}
                onFocus={warmStripeBrowser}
                onTouchStart={warmStripeBrowser}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Pay {priceLabel}
              </Button>
              {clientSecret && (
                <CheckoutPanel
                  clientSecret={clientSecret}
                  priceLabel={priceLabel}
                  onFellBack={fallBackToHosted}
                  // Settle from our own success handler: the on-page card path never navigates, so
                  // the webhook would otherwise be the only thing that buys the domain.
                  onPaid={sessionId ? () => settleDomainPurchaseAction(sessionId) : undefined}
                  onClose={() => window.location.reload()}
                  doneTitle="Your domain is on its way."
                  doneBody={`We are registering ${offer.domain} and connecting it to your website. It usually goes live within an hour, and a receipt is on its way to your email.`}
                />
              )}
              <PaymentMarks />
            </form>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
