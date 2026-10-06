'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, Plus, Ticket } from 'lucide-react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import type { OfferInput } from '@/lib/partners/offers'
import type { OwnedOffer } from '@/lib/partners/read'
import { saveOffer } from './actions'

// The Offers section of the partner listing form (scan2 L9-04). One small form, used both to add
// an offer and to edit one (pick a row and it loads into the form). Writes go through saveOffer,
// which re-checks that the offer belongs to the caller's listing.

const EMPTY: OfferInput = { id: null, title: '', description: '', terms: '', validUntil: '', active: true, questId: '', visitsRequired: '' }

function toInput(o: OwnedOffer): OfferInput {
  return {
    id: o.id,
    title: o.title,
    description: o.description ?? '',
    terms: o.memberTerms ?? '',
    validUntil: o.validUntil ? o.validUntil.slice(0, 10) : '',
    active: o.active,
    questId: o.questId ?? '',
    visitsRequired: o.visitsRequired ? String(o.visitsRequired) : '',
  }
}

function expired(o: OwnedOffer): boolean {
  return Boolean(o.validUntil && o.validUntil < new Date().toISOString())
}

export function OffersSection({ offers, quests = [] }: { offers: OwnedOffer[]; quests?: { id: string; name: string }[] }) {
  const questName = new Map(quests.map((q) => [q.id, q.name]))
  const [form, setForm] = useState<OfferInput>(EMPTY)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  function set<K extends keyof OfferInput>(key: K, value: OfferInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit() {
    setResult(null)
    startTransition(async () => {
      const r = await saveOffer(form)
      if (isError(r)) setResult({ ok: false, text: r.error })
      else {
        setResult({ ok: true, text: form.id ? 'Offer updated.' : 'Offer added. Members see it on your listing.' })
        setForm(EMPTY)
        router.refresh()
      }
    })
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <SectionHeader title="Member offers" count={offers.length} />
      <p className="text-body-sm text-muted">
        What a member gets when they tap your plaque or scan your code. Keep one live offer at a
        time and every capture is credited to it. A loyalty card counts those taps as visits instead.
      </p>

      {offers.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No offers yet"
          description="Add one below. It shows on your listing as soon as you save it."
        />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {offers.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{o.title}</span>
                  {!o.active ? (
                    <Badge tone="neutral">Off</Badge>
                  ) : expired(o) ? (
                    <Badge tone="warning">Expired</Badge>
                  ) : (
                    <Badge tone="success">Live</Badge>
                  )}
                </div>
                {o.visitsRequired && <div className="text-meta text-primary-strong">Loyalty card: {o.visitsRequired} visits</div>}
                {o.questId && (
                  <div className="text-meta text-primary-strong">Reward for finishing {questName.get(o.questId) ?? 'a past Quest'}</div>
                )}
                {o.memberTerms && <div className="text-meta text-muted">{o.memberTerms}</div>}
                {o.validUntil && (
                  <div className="text-meta text-subtle">Valid until {o.validUntil.slice(0, 10)}</div>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(toInput(o))} aria-label={`Edit ${o.title}`}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 rounded-card border border-border bg-surface-elevated p-4">
        <h3 className="text-body font-bold text-text">{form.id ? 'Edit offer' : 'New offer'}</h3>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. 10% off your first class" className="bg-surface px-4 py-2.5" />
        </Field>
        <Field label="Description" hint="What the member gets.">
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="One free drink with any meal." className="resize-none bg-surface px-4 py-3" />
        </Field>
        <Field label="Member terms" hint="What they show or do to claim it.">
          <Textarea value={form.terms} onChange={(e) => set('terms', e.target.value)} rows={2} placeholder="Show your personal code at the counter. One per visit." className="resize-none bg-surface px-4 py-3" />
        </Field>
        <Field label="Valid until" hint="Leave empty for no end date.">
          <Input type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} className="bg-surface px-4 py-2.5" />
        </Field>
        {/* LIVE-710: a loyalty card. Each plaque tap is a visit; the member claims it at the counter. */}
        <Field label="Loyalty card" hint="Visits that earn it, 2 to 50. A plaque tap counts once a day, and the member claims it at your counter. Your plaque has to be set to count repeat visits, which we set up with you. Leave empty for an ordinary offer.">
          <Input
            type="number"
            inputMode="numeric"
            min={2}
            max={50}
            value={String(form.visitsRequired ?? '')}
            onChange={(e) => set('visitsRequired', e.target.value)}
            placeholder="e.g. 5"
            className="bg-surface px-4 py-2.5"
          />
        </Field>
        {quests.length > 0 && (
          // LIVE-673: sponsor a Quest with goods. Members who finish one of its Journeys see the
          // reward on the Journey and redeem it at your plaque. Never cash.
          <Field label="Sponsor a Quest" hint="Members who finish this Quest see your reward and claim it in person. Goods or a discount, never cash.">
            <Select
              value={form.questId ?? ''}
              onChange={(e) => set('questId', e.target.value)}
              emptyLabel="Not a Quest reward"
              options={quests.map((q) => ({ value: q.id, label: q.name }))}
              className="bg-surface"
            />
          </Field>
        )}
        <Checkbox label="Live" hint="Switch off to hide it without deleting it." checked={form.active} onChange={(e) => set('active', e.target.checked)} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {result && (
            <p className={`inline-flex items-center gap-1.5 text-body-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
              {result.ok && <Check className="h-4 w-4 shrink-0" />} {result.text}
            </p>
          )}
          <div className="ml-auto flex items-center gap-2">
            {form.id && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(EMPTY)}>
                Cancel
              </Button>
            )}
            <Button type="button" onClick={submit} disabled={isPending || !form.title.trim()} size="sm">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {form.id ? 'Save offer' : 'Add offer'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
