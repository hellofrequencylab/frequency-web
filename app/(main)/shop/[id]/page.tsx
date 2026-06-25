import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/commerce/products'
import { DetailTemplate } from '@/components/templates'
import { BuyButton } from '../../marketplace/buy-button'

export const dynamic = 'force-dynamic'

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export default async function ShopProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product || product.ownerKind !== 'platform' || product.status !== 'active') notFound()
  const soldOut = product.stock === 0

  return (
    <div className="mx-auto w-full max-w-2xl">
      <DetailTemplate
        back={{ href: '/shop', label: 'Shop' }}
        title={product.title}
        subtitle={<span className="font-semibold text-text">{usd(product.priceCents, product.currency)}</span>}
        badges={product.category ? <span className="text-xs text-subtle">{product.category}</span> : undefined}
      >
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          {product.images.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {product.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`${product.title}, photo ${i + 1}`}
                  className="aspect-square w-full rounded-xl border border-border object-cover"
                />
              ))}
            </div>
          )}

          {product.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{product.description}</p>
          )}

          <div className="mt-5 border-t border-border pt-4">
            {soldOut ? <p className="text-sm font-medium text-subtle">Sold out.</p> : <BuyButton productId={product.id} />}
          </div>
        </div>
      </DetailTemplate>
    </div>
  )
}
