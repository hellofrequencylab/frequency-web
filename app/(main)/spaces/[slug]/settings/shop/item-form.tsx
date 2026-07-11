'use client'

import { useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react'
import { Sparkles, X } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { COMMERCE_CATEGORIES, normalizeTags } from '@/lib/commerce/categories'
import type {
  CommerceVariant,
  ProductCondition,
  ProductKind,
  ServiceConfig,
  ServicePriceModel,
  VariantInput,
} from '@/lib/commerce/types'
import { createSpaceProductAction, updateProductAction, draftListingCopyAction } from './shop-actions'

// Gallery photos are stored as event-media storage PATHS but read back as resolved public URLs
// (lib/commerce/products.ts). On edit we reverse a public URL to its path so the uploader can re-seed
// its tiles; a value that is already a path (or an unexpected shape) passes through unchanged.
const PUBLIC_MARKER = '/object/public/event-media/'
function urlToStoragePath(ref: string): string {
  const i = ref.indexOf(PUBLIC_MARKER)
  return i === -1 ? ref : ref.slice(i + PUBLIC_MARKER.length)
}

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
  /** Resolved public image URLs (the reader resolves stored paths); reversed to paths for the uploader. */
  images: string[]
  category: string | null
  tags: string[]
  /** Existing variants (Etsy-Grade Phase 2), seeded into the optional variants editor on edit. */
  variants?: CommerceVariant[]
}

// A single client-side variant row in the editor. Prices/stock are kept as strings so a blank field
// (inherit price / untracked stock) round-trips cleanly.
interface VariantRow {
  id?: string
  name: string
  opt1: string
  opt2: string
  price: string
  stock: string
  sku: string
}

/** Derive up to two option dimension names from an existing variant set (the union of option keys). */
function seedDimensions(variants: CommerceVariant[]): [string, string] {
  const keys: string[] = []
  for (const v of variants) {
    for (const k of Object.keys(v.options ?? {})) if (!keys.includes(k)) keys.push(k)
  }
  return [keys[0] ?? '', keys[1] ?? '']
}

/** Seed editor rows from existing variants, aligning each option value to the two dimension columns. */
function seedRows(variants: CommerceVariant[], d1: string, d2: string): VariantRow[] {
  return variants.map((v) => ({
    id: v.id,
    name: v.name,
    opt1: d1 ? (v.options?.[d1] ?? '') : '',
    opt2: d2 ? (v.options?.[d2] ?? '') : '',
    price: v.priceCents != null ? String(v.priceCents / 100) : '',
    stock: v.stock != null ? String(v.stock) : '',
    sku: v.sku ?? '',
  }))
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
  const [images, setImages] = useState<string[]>(() => (product?.images ?? []).map(urlToStoragePath))
  const [category, setCategory] = useState(product?.category ?? '')
  const [tags, setTags] = useState<string[]>(product?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [pending, startTransition] = useTransition()
  const [drafting, setDrafting] = useState(false)

  // Optional variants editor (Etsy-Grade Phase 2). Two option dimension names + a row per variant.
  const initialDims = seedDimensions(product?.variants ?? [])
  const [optName1, setOptName1] = useState(initialDims[0])
  const [optName2, setOptName2] = useState(initialDims[1])
  const [variantRows, setVariantRows] = useState<VariantRow[]>(() =>
    seedRows(product?.variants ?? [], initialDims[0], initialDims[1]),
  )

  function addVariantRow() {
    setVariantRows((rows) => [...rows, { name: '', opt1: '', opt2: '', price: '', stock: '', sku: '' }])
  }
  function updateVariantRow(idx: number, patch: Partial<VariantRow>) {
    setVariantRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function removeVariantRow(idx: number) {
    setVariantRows((rows) => rows.filter((_, i) => i !== idx))
  }

  /** Build the sanitized VariantInput[] the actions expect. A blank price = inherit (null); a blank
   *  stock = untracked (null). Nameless rows are dropped. Option values map onto the two dimension names. */
  function buildVariants(): VariantInput[] {
    const d1 = optName1.trim()
    const d2 = optName2.trim()
    return variantRows
      .map((r, i): VariantInput | null => {
        const name = r.name.trim()
        if (!name) return null
        const options: Record<string, string> = {}
        if (d1 && r.opt1.trim()) options[d1] = r.opt1.trim()
        if (d2 && r.opt2.trim()) options[d2] = r.opt2.trim()
        const priceNum = r.price.trim() === '' ? null : Number(r.price)
        const stockNum = r.stock.trim() === '' ? null : Number(r.stock)
        return {
          id: r.id,
          name,
          options,
          priceCents: priceNum != null && Number.isFinite(priceNum) && priceNum >= 0 ? Math.round(priceNum * 100) : null,
          stock: stockNum != null && Number.isFinite(stockNum) && stockNum >= 0 ? Math.floor(stockNum) : null,
          sku: r.sku.trim() || null,
          sortOrder: i,
        }
      })
      .filter((v): v is VariantInput => v !== null)
  }

  function commitTags(next: string) {
    setTags(normalizeTags([...tags, ...next.split(',')]))
    setTagDraft('')
  }

  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (tagDraft.trim()) commitTags(tagDraft)
    } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1))
    }
  }

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
    // Gallery paths + tags are React state (not native inputs), so attach them for the create action.
    fd.set('images', JSON.stringify(images))
    fd.set('tags', JSON.stringify(tags))
    // Variants are React state too; attach the set for the create action (a product only).
    fd.set('variants', JSON.stringify(kind === 'product' ? buildVariants() : []))
    startTransition(async () => {
      if (mode === 'create') {
        await createSpaceProductAction(slug, fd)
        formRef.current?.reset()
        setTitle('')
        setDescription('')
        setKind('product')
        setPriceModel('fixed')
        setImages([])
        setCategory('')
        setTags([])
        setOptName1('')
        setOptName2('')
        setVariantRows([])
      } else if (product) {
        const priceDollars = Number(fd.get('price'))
        await updateProductAction(
          slug,
          product.id,
          {
            title,
            description: description || null,
            priceCents: Number.isFinite(priceDollars) && priceDollars >= 0 ? Math.round(priceDollars * 100) : undefined,
            productKind: toProductKind(kind),
            // Condition applies to a product; clear it when the item is a service or ticket.
            condition: kind === 'product' ? condition : null,
            category: category || null,
            images,
            tags,
            service: isService ? buildServiceConfig(fd) : undefined,
          },
          // A product replaces its variant set; a service/ticket clears any variants ([]).
          kind === 'product' ? buildVariants() : [],
        )
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

      {/* Photos — the cover is the first tile; drag or use the arrows to reorder. */}
      <MultiImageUpload
        label="Photos"
        value={images}
        onChange={setImages}
        folder="commerce-gallery"
        max={8}
        reorderable
        hint="Add up to 8. The first photo is the cover buyers see first."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`category-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
            Category
          </label>
          <select
            id={`category-${mode}-${product?.id ?? 'new'}`}
            name="category"
            className={FIELD}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Choose a category</option>
            {COMMERCE_CATEGORIES.map((c) => (
              <optgroup key={c.value} label={c.label}>
                <option value={c.value}>{c.label} (general)</option>
                {c.subcategories.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`tag-input-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
            Tags
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:border-primary">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text">
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  aria-label={`Remove tag ${t}`}
                  className="text-muted transition-colors hover:text-text"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              id={`tag-input-${mode}-${product?.id ?? 'new'}`}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => tagDraft.trim() && commitTags(tagDraft)}
              className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-text outline-none"
              placeholder={tags.length ? 'Add another' : 'e.g. ceramic, handmade'}
            />
          </div>
          <p className="mt-1 text-xs text-subtle">Enter or comma to add. Up to 12.</p>
        </div>
      </div>

      {kind === 'product' && (
        <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
          <legend className="px-1 text-xs text-subtle">Variants (optional)</legend>
          <p className="text-xs text-muted">
            Add options like size or color. Leave price blank to use the item price. Leave stock blank for
            unlimited.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`optName1-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
                Option 1 name
              </label>
              <input
                id={`optName1-${mode}-${product?.id ?? 'new'}`}
                className={FIELD}
                placeholder="e.g. Size"
                value={optName1}
                onChange={(e) => setOptName1(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`optName2-${mode}-${product?.id ?? 'new'}`} className={LABEL}>
                Option 2 name
              </label>
              <input
                id={`optName2-${mode}-${product?.id ?? 'new'}`}
                className={FIELD}
                placeholder="e.g. Color"
                value={optName2}
                onChange={(e) => setOptName2(e.target.value)}
              />
            </div>
          </div>

          {variantRows.map((row, idx) => (
            <div key={idx} className="space-y-2 rounded-lg border border-border/60 bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-subtle">Variant {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeVariantRow(idx)}
                  aria-label={`Remove variant ${idx + 1}`}
                  className="text-muted transition-colors hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                className={FIELD}
                placeholder="Name, e.g. Small / Blue"
                value={row.name}
                onChange={(e) => updateVariantRow(idx, { name: e.target.value })}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className={FIELD}
                  placeholder={optName1.trim() || 'Option 1'}
                  value={row.opt1}
                  onChange={(e) => updateVariantRow(idx, { opt1: e.target.value })}
                />
                <input
                  className={FIELD}
                  placeholder={optName2.trim() || 'Option 2'}
                  value={row.opt2}
                  onChange={(e) => updateVariantRow(idx, { opt2: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className={FIELD}
                  placeholder="Price (USD)"
                  value={row.price}
                  onChange={(e) => updateVariantRow(idx, { price: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  className={FIELD}
                  placeholder="Stock"
                  value={row.stock}
                  onChange={(e) => updateVariantRow(idx, { stock: e.target.value })}
                />
                <input
                  className={FIELD}
                  placeholder="SKU"
                  value={row.sku}
                  onChange={(e) => updateVariantRow(idx, { sku: e.target.value })}
                />
              </div>
            </div>
          ))}

          <button type="button" onClick={addVariantRow} className={buttonClasses('secondary', 'sm')}>
            Add a variant
          </button>
        </fieldset>
      )}

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
