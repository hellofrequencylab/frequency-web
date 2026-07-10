import { Package } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { listSpaceCatalog } from '@/lib/commerce/products'
import { marketGroupForKind, type CommerceProduct } from '@/lib/commerce/types'
import { createSpaceProductAction, setSpaceProductStatusAction, deleteSpaceProductAction } from './shop-actions'

// The Catalog tab of the Shop console (ADR-593). Lists THIS space's commerce_products (owner_space_id
// scoped — never the operator-wide list) and CRUDs them through the Space-gated shop actions. Server
// component + server-action forms (no client island): a create form (adaptive by item kind) plus a
// per-item row with status + delete controls. Reads from commerce_products (post-backfill), not the
// retiring JSON offerings. No em or en dashes.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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
          <form action={createSpaceProductAction.bind(null, slug)} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="kind" className={LABEL}>
                  Type
                </label>
                <select id="kind" name="kind" className={FIELD} defaultValue="product">
                  <option value="product">Product</option>
                  <option value="service">Service</option>
                  <option value="ticket">Ticket</option>
                </select>
              </div>
              <div>
                <label htmlFor="price" className={LABEL}>
                  Price (USD)
                </label>
                <input id="price" name="price" type="number" min="0" step="0.01" inputMode="decimal" required className={FIELD} placeholder="e.g. 40" />
              </div>
            </div>
            <div>
              <label htmlFor="title" className={LABEL}>
                Name
              </label>
              <input id="title" name="title" required maxLength={200} className={FIELD} placeholder="e.g. 60-minute massage" />
            </div>
            <div>
              <label htmlFor="description" className={LABEL}>
                Details
              </label>
              <textarea id="description" name="description" rows={3} maxLength={2000} className={FIELD} placeholder="What it is, what is included." />
            </div>
            <fieldset className="grid grid-cols-1 gap-4 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs text-subtle">For services (optional)</legend>
              <div>
                <label htmlFor="durationMin" className={LABEL}>
                  Duration (minutes)
                </label>
                <input id="durationMin" name="durationMin" type="number" min="0" step="1" className={FIELD} placeholder="e.g. 60" />
              </div>
              <div>
                <label htmlFor="deposit" className={LABEL}>
                  Deposit (USD)
                </label>
                <input id="deposit" name="deposit" type="number" min="0" step="0.01" className={FIELD} placeholder="e.g. 10" />
              </div>
            </fieldset>
            <div className="flex justify-end">
              <button type="submit" className={buttonClasses('primary', 'md')}>
                List it
              </button>
            </div>
          </form>
        </details>
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
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text">{p.title}</p>
                <p className="text-xs text-muted">
                  {GROUP_LABEL[marketGroupForKind(p.productKind)]} · {usd(p.priceCents)} · {STATUS_LABEL[p.status]}
                </p>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2">
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
                    <button type="submit" className={buttonClasses('ghost', 'sm')}>
                      Delete
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
