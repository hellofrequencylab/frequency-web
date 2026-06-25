import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getProduct } from '@/lib/commerce/products'
import { updateShopProductAction } from '../actions'

export const dynamic = 'force-dynamic'

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export default async function EditShopProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('admin', { staff: 'platform' })
  const { id } = await params
  const product = await getProduct(id)
  if (!product || product.ownerKind !== 'platform') notFound()

  return (
    <AdminTemplate
      title="Edit product"
      eyebrow="Marketplace"
      description={product.title}
      back={{ href: '/admin/marketplace', label: 'Marketplace' }}
      width="default"
    >
      <AdminSection>
        <form action={updateShopProductAction.bind(null, id)} className="space-y-4">
          <div>
            <label htmlFor="title" className={LABEL}>Title</label>
            <input id="title" name="title" required maxLength={200} defaultValue={product.title} className={FIELD} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="price" className={LABEL}>Price (USD)</label>
              <input id="price" name="price" type="number" min="0" step="0.01" required defaultValue={(product.priceCents / 100).toFixed(2)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="category" className={LABEL}>Category</label>
              <input id="category" name="category" maxLength={60} defaultValue={product.category ?? ''} className={FIELD} />
            </div>
            <div>
              <label htmlFor="stock" className={LABEL}>Stock</label>
              <input id="stock" name="stock" type="number" min="0" step="1" defaultValue={product.stock ?? ''} className={FIELD} placeholder="Unlimited" />
            </div>
          </div>
          <div>
            <label htmlFor="description" className={LABEL}>Description</label>
            <textarea id="description" name="description" rows={4} maxLength={2000} defaultValue={product.description ?? ''} className={FIELD} />
          </div>
          <div className="flex justify-end gap-2">
            <Link href="/admin/marketplace" className={buttonClasses('ghost', 'md')}>Cancel</Link>
            <button type="submit" className={buttonClasses('primary', 'md')}>Save changes</button>
          </div>
        </form>
      </AdminSection>
    </AdminTemplate>
  )
}
