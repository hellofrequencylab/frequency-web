'use client'

// Email Studio (2026) Phase 4 — the SEARCH-BY-OWNER product picker (the productCard block's rail editor).
// Flow: search a maker or Space owner, pick one, then pick a product from THEIR catalog. Selecting a product
// stores a data-bound `product` reference plus a snapshot (title / price / image / link) so the canvas preview
// reads immediately; the send pipeline refreshes those from the live catalog so the card never goes stale.
// Also carries the button-label field. On-screen guidance explains the block. Semantic DAWN tokens for the app
// chrome; voice canon (no em dashes).

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, Loader2, Package, Search, Store, User, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import {
  searchProductOwnersAction,
  listOwnerProductsAction,
  type ProductOwner,
  type ProductOption,
} from './product-picker-actions'

interface ProductRef {
  id: string
  ownerKind?: 'profile' | 'space' | 'platform'
  ownerId?: string
}

function readRef(v: unknown): ProductRef | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && o.id ? { id: o.id } : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function ProductCardEditor({
  content,
  onField,
}: {
  content: Record<string, unknown>
  onField: (key: string, value: unknown) => void
}) {
  const selectedRef = readRef(content.product)
  const selectedTitle = str(content.title)
  const selectedPrice = str(content.price)
  const selectedImage = str(content.image)

  const [query, setQuery] = useState('')
  const [owners, setOwners] = useState<ProductOwner[]>([])
  const [owner, setOwner] = useState<ProductOwner | null>(null)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [loading, startLoad] = useTransition()
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced owner search. A short query simply does not fire; the results are hidden by a query-length
  // guard in the render, so no synchronous setState is needed here (which would cascade renders).
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (query.trim().length < 2) return
    debounce.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchProductOwnersAction(query)
        if (isError(res)) {
          setError(res.error)
          setOwners([])
        } else {
          setError(null)
          setOwners(res.data)
        }
      })
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [query])

  function pickOwner(o: ProductOwner) {
    setOwner(o)
    setProducts([])
    startLoad(async () => {
      const res = await listOwnerProductsAction({ kind: o.kind, id: o.id })
      if (isError(res)) {
        setError(res.error)
        setProducts([])
      } else {
        setError(null)
        setProducts(res.data)
      }
    })
  }

  function pickProduct(p: ProductOption) {
    const ref: ProductRef = {
      id: p.id,
      ownerKind: owner?.kind,
      ownerId: owner?.id,
    }
    onField('product', ref)
    // Store the snapshot so the canvas + preview read immediately (send refreshes these).
    onField('title', p.title || undefined)
    onField('price', p.price || undefined)
    onField('image', p.image || undefined)
    onField('url', p.url || undefined)
    // Collapse the search back down; the summary now shows the pick.
    setOwner(null)
    setOwners([])
    setProducts([])
    setQuery('')
  }

  function clearProduct() {
    onField('product', undefined)
    onField('title', undefined)
    onField('price', undefined)
    onField('image', undefined)
    onField('url', undefined)
  }

  const ctaLabel = str(content.ctaLabel)

  return (
    <div className="space-y-3">
      <p className="text-2xs leading-relaxed text-muted">
        Search a maker or Space, then pick one of their products. The card pulls its photo, title, price, and
        link from the live catalog when the email sends, so it never goes stale.
      </p>

      {/* Current selection summary, or the search flow. */}
      {selectedRef ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
          {selectedImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- operator catalog asset URL, not a build asset
            <img src={selectedImage} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-elevated text-subtle">
              <Package className="h-4 w-4" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-text">{selectedTitle || 'Selected product'}</span>
            {selectedPrice && <span className="block truncate text-2xs text-primary-strong">{selectedPrice}</span>}
          </span>
          <button
            type="button"
            onClick={clearProduct}
            aria-label="Remove this product"
            className="shrink-0 rounded p-1 text-subtle transition-colors hover:bg-danger-bg hover:text-danger"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Owner search box. */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a maker or Space"
              aria-label="Search a maker or Space to find their products"
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-8 text-xs text-text placeholder:text-subtle focus:border-primary focus:outline-none"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-subtle" aria-hidden />
            )}
          </div>

          {/* Owner results (before an owner is picked). Guarded on query length so a shortened query hides
              stale results without a synchronous state reset. */}
          {!owner && query.trim().length >= 2 && owners.length > 0 && (
            <ul className="space-y-1">
              {owners.map((o) => (
                <li key={`${o.kind}-${o.id}`}>
                  <button
                    type="button"
                    onClick={() => pickOwner(o)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-left transition-colors hover:border-primary"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-subtle">
                      {o.kind === 'space' ? <Store className="h-3 w-3" aria-hidden /> : <User className="h-3 w-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-text">{o.label}</span>
                      <span className="block truncate text-3xs text-subtle">{o.sublabel}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!owner && !searching && query.trim().length >= 2 && owners.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-2.5 py-3 text-center text-2xs text-muted">
              No maker or Space matches that. Try another name.
            </p>
          )}

          {/* Product results (after an owner is picked). */}
          {owner && (
            <div className="space-y-1.5 rounded-lg border border-border bg-surface-elevated/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-2xs font-semibold text-text">{owner.label}</p>
                <button
                  type="button"
                  onClick={() => {
                    setOwner(null)
                    setProducts([])
                  }}
                  className="shrink-0 text-3xs font-semibold text-subtle underline hover:text-text"
                >
                  Back
                </button>
              </div>
              {loading ? (
                <p className="flex items-center gap-1.5 px-1 py-2 text-2xs text-subtle">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Loading products
                </p>
              ) : products.length === 0 ? (
                <p className="px-1 py-2 text-2xs text-muted">
                  This owner has no products yet.
                </p>
              ) : (
                <ul className="max-h-60 space-y-1 overflow-y-auto">
                  {products.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickProduct(p)}
                        className="group flex w-full items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-left transition-colors hover:ring-1 hover:ring-primary"
                      >
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- operator catalog asset URL, not a build asset
                          <img src={p.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-elevated text-subtle">
                            <Package className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-text">{p.title || 'Untitled'}</span>
                          <span className="block truncate text-3xs text-subtle">
                            {p.price || 'No price'}
                            {!p.active && ' · draft'}
                          </span>
                        </span>
                        <Check className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 group-hover:opacity-100" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger-bg px-2.5 py-1.5 text-2xs text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Button label for the card's CTA. */}
      <label className="block space-y-1">
        <span className="text-2xs font-semibold text-subtle">Button label</span>
        <input
          type="text"
          value={ctaLabel}
          onChange={(e) => onField('ctaLabel', e.target.value || undefined)}
          placeholder="View product"
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle focus:border-primary focus:outline-none"
        />
      </label>
    </div>
  )
}
