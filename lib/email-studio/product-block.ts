import 'server-only'

// Email Studio (2026) Phase 4 — the SEND-TIME data binding for email. Two jobs, both run in the compile path
// (lib/email-studio/send.ts) just before an EmailDoc is rendered, so an email always ships LIVE data:
//
//   1. resolveProductRefs — the data-bound `productCard` block. It carries a product REFERENCE (the picked
//      product's id) plus a SNAPSHOT of the title / price / image / link taken when it was picked. At send
//      time this refreshes that snapshot from the live commerce catalog (lib/commerce/products.getProduct),
//      so the card never goes stale. Fail-safe: a deleted / missing product keeps the last-known snapshot
//      (a graceful fallback), never a blank or a crash.
//
//   2. renderTransactionalTemplate — the seam that makes the hardcoded transactional emails (lib/email.ts)
//      WYSIWYG-editable. When an operator has seeded + edited the matching template row (email_templates,
//      matched by the transactional preset NAME), the sender renders from that editable block tree instead of
//      its hardcoded string; otherwise this returns null and the sender keeps its proven hardcoded copy.
//      Additive + safe: any error returns null, so a transactional send is never broken by this path.
//
// Server-only (reads the RLS-deny-all email_templates via the admin client, behind app-code authz). Voice
// canon: no em dashes in any copy this module emits.
//
// 2026-09-05 (scan2 L4-04, L9-09): job 2 above is gone. renderTransactionalTemplate had no caller (the
// welcome and invite senders in lib/email.ts deliberately never imported this server-only module), and
// the "seeder" that was to write the matching email_templates row never existed, so the editable
// transactional path was dead at both ends. It was removed together with lib/email-studio/presets.ts
// (the transactional presets and EMAIL_PRESETS, imported by nothing outside their own test). Every
// transactional sender renders its hardcoded copy; nothing here reads email_templates any more. Only
// job 1 (resolveProductRefs + productVarsFromLayout, consumed by lib/email-studio/send.ts) remains.

import { getProduct } from '@/lib/commerce/products'
import { formatPriceCents } from '@/lib/commerce/types'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

// ── 1. Product card resolution ─────────────────────────────────────────────────────────────────────────────

// Canonical site URL, inlined from the env rather than imported from @/lib/site — that module
// pulls the nav registry (lib/nav/registry -> nav-areas) into this send-path module's graph, which
// needlessly drags the whole navigation tree into every email compile. Same value, no heavy edge.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://frequencylocal.com'

/** The public app link for a commerce product (routes to the Market detail page). */
export function productUrl(id: string): string {
  return `${SITE_URL}/market/${id}`
}

/**
 * Refresh the email's `productCard` block from the LIVE catalog. A block id appears at most once per layout,
 * so there is at most one product card; when it carries a `product` ref, this fetches the current product and
 * overwrites the block's title / price / image / url with fresh values. A missing / deleted product leaves the
 * stored snapshot untouched (graceful fallback). Pure aside from the single read; returns a NEW layout (never
 * mutates the input) and is fail-safe: any error yields the input unchanged.
 */
export async function resolveProductRefs(layout: EntityLayout): Promise<EntityLayout> {
  const src = layout.content
  if (!src || typeof src !== 'object') return layout
  const bag = (src as Record<string, Record<string, unknown>>).productCard
  if (!bag || typeof bag !== 'object') return layout
  const ref = bag.product as { id?: unknown } | undefined
  const id = typeof ref?.id === 'string' ? ref.id.trim() : ''
  if (!id) return layout

  let product = null
  try {
    product = await getProduct(id)
  } catch {
    product = null
  }
  if (!product) return layout // graceful: keep the last-known snapshot

  const price =
    typeof product.priceCents === 'number' && Number.isFinite(product.priceCents)
      ? formatPriceCents(product.priceCents)
      : typeof bag.price === 'string'
        ? bag.price
        : ''
  // The key `productCard` is a fixed literal, never a user value, so the computed write is injection-safe.
  const resolved: Record<string, unknown> = {
    ...bag,
    title: product.title || (typeof bag.title === 'string' ? bag.title : ''),
    price,
    image: product.images[0] ?? (typeof bag.image === 'string' ? bag.image : ''),
    url: productUrl(product.id),
  }
  return { ...layout, content: { ...(src as Record<string, Record<string, unknown>>), productCard: resolved } }
}

/**
 * The product merge variables (`product.title` / `product.price` / `product.url`) read off the (already
 * resolved) email layout's product card. Pure — call AFTER resolveProductRefs so the tokens carry the live
 * values. Absent tokens fall back to MERGE_TAG_DEFAULT_FALLBACKS at applyMergeTags time.
 */
export function productVarsFromLayout(layout: EntityLayout): Record<string, string> {
  const bag = (layout.content as Record<string, Record<string, unknown>> | undefined)?.productCard
  if (!bag) return {}
  const vars: Record<string, string> = {}
  if (typeof bag.title === 'string' && bag.title.trim()) vars['product.title'] = bag.title
  if (typeof bag.price === 'string' && bag.price.trim()) vars['product.price'] = bag.price
  if (typeof bag.url === 'string' && bag.url.trim()) vars['product.url'] = bag.url
  return vars
}
