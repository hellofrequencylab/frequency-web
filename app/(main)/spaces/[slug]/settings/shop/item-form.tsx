'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { Sparkles } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import type { ProductCondition, ProductKind, ServiceConfig, ServicePriceModel } from '@/lib/commerce/types'
import { createSpaceProductAction, updateProductAction, draftListingCopyAction } from './shop-actions'

// The Catalog item authoring form (ADR-596, findings #3/#5/F5). One client form serves both create and
// edit: it carries the price-model + policy inputs, reveals the cancellation/no-show pair only when a
// charge applies, and wires the "Draft with Vera" button that fills the title + description. Create
// submits the raw FormData to createSpaceProductAction (server parses it); edit builds a typed patch and
// calls updateProductAction. No em or en dashes.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

type FormKind = 'product' | 'service' | 'ticket'

export interface ItemFormProduct {
  id: string
  title: string
  description: string | null
  priceCents: number
  productKind: ProductKind
  condition: ProductCondition | null
  service: ServiceConfig | null
}

const PRICE_MODEL_LABEL: Record<ServicePriceModel, string> = {
  fixed: 'Fixed price',
  from: 'From (starting at)',
  free: 'Free',
  contact: 'Contact for pricing',
}

function toFormKind(kind: ProductKind): FormKind {
  if (kind === 'service' || kind === 'booking') return 'service'
  if (kind === 'ticket') return 'ticket'
  return 'product'
}

function toProductKind(kind: FormKind): ProductKind {
  if (kind === 'service') return 'service'
  if (kind === 'ticket') return 'ticket'
  return 'physical'
}

/** Read a positive number from the form, or undefined when blank/zero/invalid. */
function posNum(fd: FormData, key: string): number | undefined {
  const v = Number(fd.get(key))
  return Number.isFinite(v) && v > 0 ? v : undefined
}

export function ItemForm({
  slug,
  mode,
  product,
  onDone,
}: {
  slug: string
  mode: 'create' | 'edit'
  product?: ItemFormProduct
  onDone?: () => void
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [kind, setKind] = useState<FormKind>(product ? toFormKind(product.productKind) : 'product')
  const [priceModel, setPriceModel] = useState<ServicePriceModel>(product?.service?.priceModel ?? 'fixed')
  const [condition, setCondition] = useState<ProductCondition>(product?.condition ?? 'used')
  const [title, setTitle] = useState(product?.title ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [pending, startTransition] = useTransition()
  const [drafting, setDrafting] = useState(false)

  const isService = kind === 'service'
  // Cancellation + no-show only make sense when there is a charge to protect.
  const showPolicy = isService && (priceModel === 'fixed' || priceModel === 'from')
  const svc = product?.service ?? null

  function buildServiceConfig(fd: FormData): ServiceConfig {
    const depositDollars = posNum(fd, 'deposit')
    // Send every key (undefined for blanks) so an edit fully overwrites the authored policy; the writer
    // prunes the undefined keys and keeps sibling fields (recurrence, sliding scale) it does not author.
    return {
      priceModel,
      durationMin: posNum(fd, 'durationMin'),
      depositCents: depositDollars !== undefined ? Math.round(depositDollars * 100) : undefined,
      cancellationWindowHours: showPolicy ? posNum(fd, 'cancellationWindowHours') : undefined,
      noShowFeePct: showPolicy ? Math.min(100, posNum(fd, 'noShowFeePct') ?? 0) || undefined : undefined,
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      if (mode === 'create') {
        await createSpaceProductAction(slug, fd)
        formRef.current?.reset()
        setTitle('')
        setDescription('')
        setKind('product')
        setPriceModel('fixed')
      } else if (product) {
        const priceDollars = Number(fd.get('price'))
        await updateProductAction(slug, product.id, {
          title,
          description: description || null,
          priceCents: Number.isFinite(priceDollars) && priceDollars >= 0 ? Math.round(priceDollars * 100) : undefined,
          productKind: toProductKind(kind),
          // Condition applies to a product; clear it when the item is a service or ticket.
          condition: kind === 'product' ? condition : null,
          service: isService ? buildServiceConfig(fd) : undefined,
        })
      }
      onDone?.()
    })
  }

  async function draftWithVera() {
    setDrafting(true)
    try {
      const copy = await draftListingCopyAction(slug, {
        kind: toProductKind(kind),
        seed: title || null,
        priceModel: isService ? priceModel : null,
      })
      if (copy.title) setTitle(copy.title)
      if (copy.description) setDescription(copy.description)
    } finally {
      setDrafting(false)
    }
  }

  const busy = pending || drafting

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`kind-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
            Type
          </label>
          <select
            id={`kind-${mode}-${product?.id ?? 'new'}`}
            name="kind"
            className={FIELD}
            value={kind}
            onChange={(e) => setKind(e.target.value as FormKind)}
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
            <option value="ticket">Ticket</option>
          </select>
          <p className="mt-1 text-xs text-subtle">
            Product ships or hands over. Service is a booking on your calendar. Ticket is a spot at one of
            your events.
          </p>
        </div>
        <div>
          <label htmlFor={`price-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
            Price (USD)
          </label>
          <input
            id={`price-${mode}-${product?.id ?? 'new'}`}
            name="price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            className={FIELD}
            placeholder="e.g. 40"
            defaultValue={product ? product.priceCents / 100 : ''}
          />
          {isService && (priceModel === 'free' || priceModel === 'contact') && (
            <p className="mt-1 text-xs text-subtle">
              {priceModel === 'free'
                ? 'This service shows as Free. Set the price to 0.'
                : 'Buyers contact you for pricing, so the price is not shown.'}
            </p>
          )}
        </div>
      </div>

      {kind === 'product' && (
        <div>
          <label htmlFor={`condition-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
            Condition
          </label>
          {/* Business Spaces may list New or Used (R3). */}
          <select
            id={`condition-${mode}-${product?.id ?? 'new'}`}
            name="condition"
            className={FIELD}
            value={condition}
            onChange={(e) => setCondition(e.target.value as ProductCondition)}
          >
            <option value="new">New</option>
            <option value="used">Used</option>
          </select>
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor={`title-${mode}-${product?.id ?? 'new'}`} className="text-sm font-medium text-text">
            Name
          </label>
          <button
            type="button"
            onClick={draftWithVera}
            disabled={busy}
            className={buttonClasses('ghost', 'sm')}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden />
            {drafting ? 'Drafting...' : 'Draft with Vera'}
          </button>
        </div>
        <input
          id={`title-${mode}-${product?.id ?? 'new'}`}
          name="title"
          required
          maxLength={200}
          className={FIELD}
          placeholder="e.g. 60-minute massage"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={`description-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
          Details
        </label>
        <textarea
          id={`description-${mode}-${product?.id ?? 'new'}`}
          name="description"
          rows={3}
          maxLength={2000}
          className={FIELD}
          placeholder="What it is, what is included."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {isService && (
        <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
          <legend className="px-1 text-xs text-subtle">For services</legend>
          <p className="text-xs text-muted">
            A service is a booking on your calendar. Members pick a time from your Booking hours, so set
            those in Booking first or there will be no times to pick.
          </p>
          <div>
            <label htmlFor={`priceModel-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
              Pricing
            </label>
            <select
              id={`priceModel-${mode}-${product?.id ?? 'new'}`}
              name="priceModel"
              className={FIELD}
              value={priceModel}
              onChange={(e) => setPriceModel(e.target.value as ServicePriceModel)}
            >
              {(Object.keys(PRICE_MODEL_LABEL) as ServicePriceModel[]).map((m) => (
                <option key={m} value={m}>
                  {PRICE_MODEL_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`durationMin-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
                Duration (minutes)
              </label>
              <input
                id={`durationMin-${mode}-${product?.id ?? 'new'}`}
                name="durationMin"
                type="number"
                min="0"
                step="1"
                className={FIELD}
                placeholder="e.g. 60"
                defaultValue={svc?.durationMin ?? ''}
              />
            </div>
            <div>
              <label htmlFor={`deposit-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
                Deposit (USD)
              </label>
              <input
                id={`deposit-${mode}-${product?.id ?? 'new'}`}
                name="deposit"
                type="number"
                min="0"
                step="0.01"
                className={FIELD}
                placeholder="e.g. 10"
                defaultValue={svc?.depositCents != null ? svc.depositCents / 100 : ''}
              />
              <p className="mt-1 text-xs text-subtle">
                Bookings charge the full price at checkout for now. Deposits are coming.
              </p>
            </div>
          </div>
          {showPolicy && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`cancellationWindowHours-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
                  Free cancellation window (hours)
                </label>
                <input
                  id={`cancellationWindowHours-${mode}-${product?.id ?? 'new'}`}
                  name="cancellationWindowHours"
                  type="number"
                  min="0"
                  step="1"
                  className={FIELD}
                  placeholder="e.g. 24"
                  defaultValue={svc?.cancellationWindowHours ?? ''}
                />
                <p className="mt-1 text-xs text-subtle">Hours before the booking that a free cancel closes.</p>
              </div>
              <div>
                <label htmlFor={`noShowFeePct-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
                  No-show fee (%)
                </label>
                <input
                  id={`noShowFeePct-${mode}-${product?.id ?? 'new'}`}
                  name="noShowFeePct"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className={FIELD}
                  placeholder="e.g. 50"
                  defaultValue={svc?.noShowFeePct ?? ''}
                />
                <p className="mt-1 text-xs text-subtle">Charged for a no-show or a late cancel.</p>
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className={buttonClasses('primary', 'md')}>
          {mode === 'create' ? 'List it' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
