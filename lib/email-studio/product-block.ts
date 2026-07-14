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

import { createAdminClient } from '@/lib/supabase/admin'
import { getProduct } from '@/lib/commerce/products'
import { formatPriceCents } from '@/lib/commerce/types'
import { SITE_URL } from '@/lib/site'
import { sanitizeEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import { compileEmailDoc } from './shell'
import { applyMergeTags } from './render'
import { transactionalPresetByKey } from './presets'
import { MERGE_TAG_DEFAULT_FALLBACKS, type EmailDoc } from './types'

// ── 1. Product card resolution ─────────────────────────────────────────────────────────────────────────────

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

// ── 2. Transactional editable-template seam ──────────────────────────────────────────────────────────────

/** What a transactional sender needs to enqueue an email rendered from an editable template. */
export interface TransactionalRender {
  subject: string
  html: string
  text: string
}

/**
 * Render an in-house transactional email from its EDITABLE template, or return null when none exists yet.
 *
 * Looks up the `email_templates` row whose name matches the transactional preset for `key` (seeded via the
 * Templates gallery, then editable in the WYSIWYG). When found, compiles its block tree through the SAME
 * themed shell + merge-tag pipeline the campaign sender uses, applying the caller's per-recipient `vars` (and
 * the shared default fallbacks). When absent, returns null so the caller keeps its hardcoded string.
 *
 * Fail-safe by construction: unknown key, missing row, empty layout, or any thrown error all yield null, so
 * wiring a sender through this can never break the send. `vars` values are HTML-escaped in the html pass.
 */
export async function renderTransactionalTemplate(
  key: string,
  vars: Record<string, string> = {},
  opts: { unsubscribeUrl?: string; fallbacks?: Record<string, string> } = {},
): Promise<TransactionalRender | null> {
  const preset = transactionalPresetByKey(key)
  if (!preset) return null
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('email_templates')
      .select('block_json, subject, preheader')
      .eq('name', preset.name)
      .maybeSingle()
    if (!data) return null // not seeded / not yet made editable — caller uses the hardcoded copy

    const layout = sanitizeEntityLayout((data as { block_json: unknown }).block_json, 'email')
    if (!layout || !(layout.rows?.length)) return null

    const resolvedLayout = await resolveProductRefs(layout)
    const doc: EmailDoc = {
      layout: resolvedLayout,
      subject: (data as { subject: string | null }).subject?.trim() || preset.subject,
      preheader: (data as { preheader: string | null }).preheader ?? preset.preheader,
    }
    const compiled = compileEmailDoc(doc, { unsubscribeUrl: opts.unsubscribeUrl })
    if (!compiled.html) return null

    const fallbacks = { ...MERGE_TAG_DEFAULT_FALLBACKS, ...(opts.fallbacks ?? {}) }
    const allVars = { ...vars, ...productVarsFromLayout(resolvedLayout) }
    const html = applyMergeTags(compiled.html, allVars, { fallbacks })
    const text = applyMergeTags(compiled.text, allVars, { fallbacks, escape: false })
    const subject = applyMergeTags(compiled.subject, allVars, { fallbacks, escape: false })
    return { subject, html, text }
  } catch (err) {
    console.error('[email-studio] renderTransactionalTemplate failed, using hardcoded copy:', err)
    return null
  }
}
