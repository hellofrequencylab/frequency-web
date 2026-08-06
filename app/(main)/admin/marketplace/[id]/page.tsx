import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { getProduct } from '@/lib/commerce/products'
import { updateShopProductAction } from '../actions'

export const dynamic = 'force-dynamic'

const LABEL = 'text-body-sm text-text'

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
          <Field label="Title" labelClassName={LABEL}>
            <Input name="title" required maxLength={200} defaultValue={product.title} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Price (USD)" labelClassName={LABEL}>
              <Input name="price" type="number" min="0" step="0.01" required defaultValue={(product.priceCents / 100).toFixed(2)} />
            </Field>
            <Field label="Category" labelClassName={LABEL}>
              <Input name="category" maxLength={60} defaultValue={product.category ?? ''} />
            </Field>
            <Field label="Stock" labelClassName={LABEL}>
              <Input name="stock" type="number" min="0" step="1" defaultValue={product.stock ?? ''} placeholder="Unlimited" />
            </Field>
          </div>
          <Field label="Description" labelClassName={LABEL}>
            <Textarea name="description" rows={4} maxLength={2000} defaultValue={product.description ?? ''} />
          </Field>
          <div className="flex justify-end gap-2">
            <Link href="/admin/marketplace" className={buttonClasses('ghost', 'md')}>Cancel</Link>
            <button type="submit" className={buttonClasses('primary', 'md')}>Save changes</button>
          </div>
        </form>
      </AdminSection>
    </AdminTemplate>
  )
}
