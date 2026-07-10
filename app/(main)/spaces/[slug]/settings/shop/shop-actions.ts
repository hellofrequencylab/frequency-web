'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createProduct,
  setProductStatus,
  deleteProduct,
  updateProduct,
  productOwnerSpaceId,
} from '@/lib/commerce/products'
import { readStorefrontConfig, withStorefrontConfig } from '@/lib/spaces/storefront'
import type { ProductStatus, ProductKind, CommerceVertical, ServiceConfig } from '@/lib/commerce/types'

// Space Shop console write actions (ADR-593). Every action gates on resolveSpaceManageAccess (owner /
// admin / editor — NOT the profile-only productOwnerProfileId, which is null for a Space), and each
// per-item action also checks productOwnerSpaceId === space.id so one Space can never touch another's
// catalog. Reuses the existing commerce writers (createProduct / updateProduct / setProductStatus /
// deleteProduct); no checkout change is needed. Billing stays gated OFF, so nothing charges.

/** Resolve the Space + assert the caller may manage it (write authority). Returns the space id, or null
 *  when the caller is not an editor (a staff preview is read-only, so it cannot write). */
async function gateSpaceWrite(slug: string): Promise<{ spaceId: string } | null> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return null
  // The Shop is a Business-account feature; enforce the same space-type gate as the page here too, since
  // server actions are addressable independently of the page render (defense in depth, ADR-593).
  if (!isConsoleSpaceType(space.type)) return null
  return { spaceId: space.id }
}

/** Map the editor's `kind` to (product_kind, vertical). Service items sit on the 'service' vertical; a
 *  product or ticket rides 'shop'. marketGroupForKind derives the Market rail from product_kind (Phase 5). */
function kindToCommerce(kind: string): { productKind: ProductKind; vertical: CommerceVertical } {
  if (kind === 'service') return { productKind: 'service', vertical: 'service' }
  if (kind === 'ticket') return { productKind: 'ticket', vertical: 'shop' }
  return { productKind: 'physical', vertical: 'shop' }
}

/** Build the metadata.service ServiceConfig from the form (service items only). */
function serviceConfigFromForm(formData: FormData): ServiceConfig | null {
  const durationMin = Number(formData.get('durationMin'))
  const depositDollars = Number(formData.get('deposit'))
  const cfg: ServiceConfig = {}
  if (Number.isFinite(durationMin) && durationMin > 0) cfg.durationMin = Math.round(durationMin)
  if (Number.isFinite(depositDollars) && depositDollars > 0) cfg.depositCents = Math.round(depositDollars * 100)
  return Object.keys(cfg).length ? cfg : null
}

export async function createSpaceProductAction(slug: string, formData: FormData): Promise<void> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return

  const title = String(formData.get('title') ?? '').trim()
  const priceDollars = Number(formData.get('price'))
  if (!title || !Number.isFinite(priceDollars) || priceDollars < 0) return

  const kind = String(formData.get('kind') ?? 'product')
  const { productKind, vertical } = kindToCommerce(kind)
  const service = productKind === 'service' ? serviceConfigFromForm(formData) : null

  const product = await createProduct({
    ownerKind: 'space',
    ownerSpaceId: gate.spaceId,
    // MUST pass both explicitly — createProduct defaults product_kind='physical' and vertical='maker'.
    productKind,
    vertical,
    title,
    description: (formData.get('description') as string) || null,
    category: (formData.get('category') as string) || null,
    priceCents: Math.round(priceDollars * 100),
  })
  if (!product) return

  if (service) await updateProduct(product.id, { metadata: { service } })
  // A listed item is live to browse immediately; checkout still needs payouts + billing on.
  await setProductStatus(product.id, 'active')
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Ownership-gate a per-item write: the caller manages the Space AND the item belongs to it. */
async function gateSpaceItem(slug: string, productId: string): Promise<boolean> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return false
  return (await productOwnerSpaceId(productId)) === gate.spaceId
}

export async function setSpaceProductStatusAction(slug: string, id: string, status: ProductStatus): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  await setProductStatus(id, status)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

export async function deleteSpaceProductAction(slug: string, id: string): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  await deleteProduct(id)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Save the Storefront tab settings: the renameable tab label + the published toggle (Phase 6 surfaces
 *  the public tab from this). Stored on the fail-safe preferences.storefront node. */
export async function saveStorefrontSettingsAction(slug: string, formData: FormData): Promise<void> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return
  if (!isConsoleSpaceType(space.type)) return

  const current = readStorefrontConfig(space.preferences)
  const tabLabel = String(formData.get('tabLabel') ?? '').trim().slice(0, 40) || current.tabLabel
  const published = formData.get('published') === 'on'
  const next = withStorefrontConfig(space.preferences, { tabLabel, published })
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  await db.from('spaces').update({ preferences: next }).eq('id', space.id)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}
