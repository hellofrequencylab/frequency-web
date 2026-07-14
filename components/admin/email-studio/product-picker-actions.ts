'use server'

// Email Studio (2026) Phase 4 — the SEARCH-BY-OWNER product picker's server actions. Two gated reads that let
// the editor find a maker / Space owner and list THAT owner's catalog, then drop one product into the email as
// a data-bound `productCard`. Reuses the existing (previously unused-by-email) commerce queries
// (listMyMakerProducts / listSpaceCatalog) and resolves each product to a send-ready snapshot (title, price,
// image, link). Gated by the same Beta CONTENT-WRITER gate the template actions use; these are read-only
// prepare operations, nothing is sent. Voice canon: no em dashes.

import type { ActionResult } from '@/lib/action-result'
import { ok, fail } from '@/lib/action-result'
import { writerGate } from '@/lib/beta/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMyMakerProducts, listSpaceCatalog } from '@/lib/commerce/products'
import { formatPriceCents } from '@/lib/commerce/types'
import { productUrl } from '@/lib/email-studio/product-block'

/** An owner the editor can pick products from: a maker (profile) or a Space. */
export interface ProductOwner {
  kind: 'profile' | 'space'
  id: string
  label: string
  /** A secondary line (a handle or slug) so two same-named owners are still distinguishable. */
  sublabel: string
}

/** A send-ready product option (a snapshot the block stores; the compile path refreshes it at send). */
export interface ProductOption {
  id: string
  title: string
  price: string
  image: string
  url: string
  /** Whether the product is currently active (draft / archived items are still pickable but flagged). */
  active: boolean
}

const MAX_OWNERS = 8

/** Search makers (profiles) and Spaces by name / handle / slug. Returns a small blended list the editor shows
 *  as pick-an-owner rows. Fail-safe: a blank query returns nothing. */
export async function searchProductOwnersAction(query: string): Promise<ActionResult<ProductOwner[]>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const q = query.trim()
  if (q.length < 2) return ok([])

  const db = createAdminClient()
  // Strip characters that would break the PostgREST `.or()` filter grammar or the ilike pattern (commas /
  // parens split the or-list; % / _ are ilike wildcards). Operator-typed + admin-gated, but keep it clean.
  const safe = q.replace(/[,()%_*]/g, ' ').trim()
  if (!safe) return ok([])
  const like = `%${safe}%`
  const [profilesRes, spacesRes] = await Promise.all([
    db
      .from('profiles')
      .select('id, display_name, handle')
      .or(`display_name.ilike.${like},handle.ilike.${like}`)
      .eq('is_active', true)
      .limit(MAX_OWNERS),
    db.from('spaces').select('id, name, slug').ilike('name', like).limit(MAX_OWNERS),
  ])

  const owners: ProductOwner[] = []
  for (const r of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
    owners.push({
      kind: 'profile',
      id: String(r.id),
      label: (r.display_name as string) || (r.handle as string) || 'A maker',
      sublabel: r.handle ? `@${r.handle}` : 'Maker',
    })
  }
  for (const r of (spacesRes.data ?? []) as Array<Record<string, unknown>>) {
    owners.push({
      kind: 'space',
      id: String(r.id),
      label: (r.name as string) || 'A Space',
      sublabel: r.slug ? `/${r.slug}` : 'Space',
    })
  }
  return ok(owners)
}

/** List one owner's products as send-ready options. A maker uses their own catalog (listMyMakerProducts); a
 *  Space uses its scoped catalog (listSpaceCatalog with the id — never the no-arg form, which would leak every
 *  Space's catalog). Fail-safe: an unknown owner returns []. */
export async function listOwnerProductsAction(
  owner: { kind: 'profile' | 'space'; id: string },
): Promise<ActionResult<ProductOption[]>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const id = owner.id?.trim()
  if (!id) return ok([])

  const products =
    owner.kind === 'profile' ? await listMyMakerProducts(id) : await listSpaceCatalog(id)

  const options: ProductOption[] = products.map((p) => ({
    id: p.id,
    title: p.title,
    price: typeof p.priceCents === 'number' && Number.isFinite(p.priceCents) ? formatPriceCents(p.priceCents) : '',
    image: p.images[0] ?? '',
    url: productUrl(p.id),
    active: p.status === 'active',
  }))
  return ok(options)
}
