import { Package } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button'
import { ProductCover } from '@/components/marketplace/product-cover'
import { listSpaceCatalog } from '@/lib/commerce/products'
import { listVariantsForProducts } from '@/lib/commerce/variants'
import { marketGroupForKind, type CommerceProduct, type ServiceConfig } from '@/lib/commerce/types'
import { ItemForm } from './item-form'
import {
  setSpaceProductStatusAction,
  deleteSpaceProductAction,
  setSpaceListingMarketPublishedAction,
  duplicateSpaceProductAction,
} from './shop-actions'

// The Catalog tab of the Shop console (ADR-596). Lists THIS space's commerce_products (owner_space_id
// scoped — never the operator-wide list) and CRUDs them through the Space-gated shop actions. Server
// component that renders the create/edit authoring form (the ItemForm client island: price model,
// policy, and Draft with Vera) plus a per-item row with status, edit, and delete controls. Reads from
// commerce_products (post-backfill), not the retiring JSON offerings. No em or en dashes.

function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Read the authored service quote + policy off the item (metadata.service), or null. */
function serviceOf(p: CommerceProduct): ServiceConfig | null {
  const s = (p.metadata as { service?: ServiceConfig } | null)?.service
  return s && typeof s === 'object' ? s : null
}

/** The price label, reflecting the authored price model (From / Free / Contact) so the operator sees
 *  exactly what a buyer will read. */
function priceLabel(p: CommerceProduct): string {
  switch (serviceOf(p)?.priceModel) {
    case 'free':
      return 'Free'
    case 'contact':
      return 'Contact for pricing'
    case 'from':
      return `From ${usd(p.priceCents)}`
    default:
      return usd(p.priceCents)
  }
}

/** The service policy line: duration, deposit, cancellation window, no-show fee — whatever is set. */
function servicePolicyLine(svc: ServiceConfig): string {
  const parts: string[] = []
  if (svc.durationMin) parts.push(`${svc.durationMin} min`)
  if (svc.depositCents) parts.push(`${usd(svc.depositCents)} deposit`)
  if (svc.cancellationWindowHours) parts.push(`Free cancellation up to ${svc.cancellationWindowHours}h before`)
  if (svc.noShowFeePct) parts.push(`No-show fee ${svc.noShowFeePct}%`)
  return parts.join(' · ')
}

const GROUP_LABEL: Record<string, string> = { products: 'Product', services: 'Service', tickets: 'Ticket' }
const STATUS_LABEL: Record<CommerceProduct['status'], string> = {
  draft: 'Hidden',
  active: 'Live',
  sold_out: 'Sold out',
  archived: 'Archived',
}
/** The status pill tone on the cover — Live reads confident, everything else recedes. */
const STATUS_TONE: Record<CommerceProduct['status'], string> = {
  draft: 'bg-surface text-subtle',
  active: 'bg-success-bg text-success',
  sold_out: 'bg-surface text-subtle',
  archived: 'bg-surface text-subtle',
}

export async function CatalogTab({ slug, spaceId, readOnly }: { slug: string; spaceId: string; readOnly: boolean }) {
  const items = await listSpaceCatalog(spaceId)
  // Seed each edit form's variants editor in one query (no N+1); products with none are simply absent.
  const variantsByProduct = await listVariantsForProducts(items.map((p) => p.id))

  return (
    <div className="mt-4 space-y-6">
      {!readOnly && (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-text">+ New item</summary>
          <ItemForm slug={slug} mode="create" />
        </details>
      )}

      {items.length > 0 && !readOnly && (
        <p className="text-xs text-muted">
          Publish shows an item on your Shop tab. Add to Market also lists it in the community Market,
          where anyone can find it.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          variant="first-use"
          title="Nothing listed yet."
          description="Add your first product, service, or ticket. It shows up here and, once you publish your storefront, on your Shop tab."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const svc = serviceOf(p)
            const policy = svc ? servicePolicyLine(svc) : ''
            const group = marketGroupForKind(p.productKind)
            return (
              <div
                key={p.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
              >
                {/* Header image — the listing's first photo, or a branded gradient + type icon. */}
                <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-surface-elevated">
                  <ProductCover image={p.images[0]} group={group} sizes="(min-width:1024px) 33vw, 100vw" />
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold shadow-sm ${STATUS_TONE[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                    {p.marketPublished && (
                      <span className="rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong shadow-sm">
                        In Market
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-subtle">
                      {GROUP_LABEL[group]}
                    </span>
                    <span className="text-sm font-bold text-text">{priceLabel(p)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 font-semibold text-text">{p.title}</p>
                  {policy && <p className="mt-0.5 line-clamp-1 text-xs text-subtle">{policy}</p>}

                  {!readOnly && (
                    <div className="mt-auto pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {p.status === 'active' ? (
                          <form action={setSpaceProductStatusAction.bind(null, slug, p.id, 'draft')}>
                            <button type="submit" className={buttonClasses('secondary', 'sm')}>
                              Hide
                            </button>
                          </form>
                        ) : (
                          <form action={setSpaceProductStatusAction.bind(null, slug, p.id, 'active')}>
                            <button type="submit" className={buttonClasses('primary', 'sm')}>
                              Publish
                            </button>
                          </form>
                        )}
                        {p.marketPublished ? (
                          <form action={setSpaceListingMarketPublishedAction.bind(null, slug, p.id, false)}>
                            <button type="submit" className={buttonClasses('ghost', 'sm')}>
                              Remove from Market
                            </button>
                          </form>
                        ) : (
                          <form action={setSpaceListingMarketPublishedAction.bind(null, slug, p.id, true)}>
                            <button type="submit" className={buttonClasses('ghost', 'sm')}>
                              Add to Market
                            </button>
                          </form>
                        )}
                        <form action={duplicateSpaceProductAction.bind(null, slug, p.id)}>
                          <button type="submit" className={buttonClasses('ghost', 'sm')}>
                            Duplicate
                          </button>
                        </form>
                        <form action={deleteSpaceProductAction.bind(null, slug, p.id)}>
                          <ConfirmSubmitButton confirm="Delete this item? This cannot be undone." label="Delete" />
                        </form>
                      </div>

                      <details className="mt-3 border-t border-border/60 pt-2">
                        <summary className="cursor-pointer text-sm font-medium text-text">Edit</summary>
                        <ItemForm
                          slug={slug}
                          mode="edit"
                          product={{
                            id: p.id,
                            title: p.title,
                            description: p.description,
                            priceCents: p.priceCents,
                            productKind: p.productKind,
                            condition: p.condition,
                            service: svc,
                            images: p.images,
                            category: p.category,
                            tags: p.tags,
                            marketPublished: p.marketPublished,
                            variants: variantsByProduct.get(p.id) ?? [],
                          }}
                        />
                      </details>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
