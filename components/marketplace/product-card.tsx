import Image from 'next/image'
import { EntityCard } from '@/components/cards/entity-card'
import type { CommerceProduct } from '@/lib/commerce/types'

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

// Browse card for a commerce product (maker / shop / Space storefront).
export function ProductCard({ product, href }: { product: CommerceProduct; href: string }) {
  const soldOut = product.status === 'sold_out' || product.stock === 0
  return (
    <EntityCard
      href={href}
      cover={
        product.images[0] ? (
          <Image fill src={product.images[0]} alt="" className="object-cover" sizes="(min-width:1024px) 25vw, 100vw" />
        ) : undefined
      }
      title={product.title}
      context={product.category ?? undefined}
      description={product.description ?? undefined}
      badge={
        soldOut ? (
          <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-medium text-subtle">
            Sold out
          </span>
        ) : undefined
      }
      meta={<span className="font-semibold text-text">{usd(product.priceCents, product.currency)}</span>}
      dimmed={soldOut}
    />
  )
}
