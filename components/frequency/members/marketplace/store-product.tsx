import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/frequency/members-b.css'
import { EventGallery } from '@/components/events/event-gallery'
import { MembersBody } from '@/components/frequency/members/shared/members-body'

// A FREQUENCY STORE PRODUCT, IN THE KIT (the public /store/<id> page). Same anatomy as the kit's
// listing page (FqListingDetail): the split hero card with the one primary action, then About and the
// photos down the main column and the facts down the side. The page keeps its reads, its Product
// JSON-LD and its Buy button; the button arrives as `buy`, so the checkout path is the page's own and
// this file never touches it.

export function FqStoreProduct({
  structuredData,
  title,
  priceLabel,
  category,
  description,
  images,
  coverUrl,
  soldOut,
  buy,
}: {
  structuredData: ReactNode
  title: string
  priceLabel: string
  category: string | null
  description: string | null
  images: string[]
  /** The hero photo: the product's first image, else the operator's /store cover, else none. */
  coverUrl: string | null
  soldOut: boolean
  /** The page's own purchase control (the Buy button, or the sold out line). */
  buy: ReactNode
}) {
  return (
    <MembersBody>
      {structuredData}
      {/* The /store index is members-only and 307s a signed-out visitor, so the way back is the
          public Discover hub (SCAN-786), as on the DAWN page. */}
      <Link className="meta fqm-back" href="/discover">
        ← Back to Discover
      </Link>

      <section className="card fqm-ev">
        <div className="ph fqm-ev-ph" style={coverUrl ? { backgroundImage: `url('${coverUrl}')` } : undefined}>
          {category && <span className="tag glass">{category}</span>}
        </div>
        <div className="fqm-ev-in">
          <span className="k">Frequency Store</span>
          <h1 className="h1">{title}</h1>
          <span className="h3">{priceLabel}</span>
          {soldOut && <span className="tag fqm-tag-start">Sold out</span>}
          <div className="fqm-ev-act">{buy}</div>
        </div>
      </section>

      <div className="ap-cols sec">
        <div className="stack fqm-secs">
          {description && (
            <div className="stack">
              <h2 className="h2">About</h2>
              <p className="body fqm-pre">{description}</p>
            </div>
          )}
          {images.length > 1 && (
            <div className="stack">
              <h2 className="h2">Photos</h2>
              <EventGallery images={images} />
            </div>
          )}
        </div>

        <aside className="side">
          <div className="panel stack">
            <span className="k">Item details</span>
            <div className="list">
              <div>
                <span className="t2 grow">Price</span>
                <span className="t1">{priceLabel}</span>
              </div>
              {category && (
                <div>
                  <span className="t2 grow">Category</span>
                  <span className="t1">{category}</span>
                </div>
              )}
              <div>
                <span className="t2 grow">Availability</span>
                <span className="t1">{soldOut ? 'Sold out' : 'In stock'}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </MembersBody>
  )
}
