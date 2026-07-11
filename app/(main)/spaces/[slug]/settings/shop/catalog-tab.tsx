import { Package } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button'
import { listSpaceCatalog } from '@/lib/commerce/products'
import { marketGroupForKind, type CommerceProduct, type ServiceConfig } from '@/lib/commerce/types'
import { ItemForm } from './item-form'
import {
  setSpaceProductStatusAction,
  deleteSpaceProductAction,
  setSpaceListingMarketPublishedAction,
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

export async function CatalogTab({ slug, spaceId, readOnly }: { slug: string; spaceId: string; readOnly: boolean }) {
  const items = await listSpaceCatalog(spaceId)

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
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((p) => {
            const svc = serviceOf(p)
            const policy = svc ? servicePolicyLine(svc) : ''
            return (
              <li key={p.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">{p.title}</p>
                    <p className="text-xs text-muted">
                      {GROUP_LABEL[marketGroupForKind(p.productKind)]} · {priceLabel(p)} · {STATUS_LABEL[p.status]}
                      {p.marketPublished ? ' · In Market' : ''}
                    </p>
                    {policy && <p className="mt-0.5 text-xs text-subtle">{policy}</p>}
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-2">
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
                      {p.status === 'active' ? (
                        <form action={setSpaceProductStatusAction.bind(null, slug, p.id, 'draft')}>
                          <button type="submit" className={buttonClasses('secondary', 'sm')}>
                            Hide
                          </button>
                        </form>
                      ) : (
                        <form action={setSpaceProductStatusAction.bind(null, slug, p.id, 'active')}>
                          <button type="submit" className={buttonClasses('secondary', 'sm')}>
                            Publish
                          </button>
                        </form>
                      )}
                      <form action={deleteSpaceProductAction.bind(null, slug, p.id)}>
                        <ConfirmSubmitButton confirm="Delete this item? This cannot be undone." label="Delete" />
                      </form>
                    </div>
                  )}
                </div>
                {!readOnly && (
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
                      }}
                    />
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
