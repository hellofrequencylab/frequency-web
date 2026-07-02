'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { createProduct, setProductStatus, updateProduct, deleteProduct } from '@/lib/commerce/products'
import { refundCommerceOrder } from '@/lib/commerce/checkout'
import { setReportStatus, type ReportStatus } from '@/lib/commerce/reports'
import { setPlatformFlag } from '@/lib/platform-flags'
import { areaFlagKey, type MarketArea } from '@/lib/marketplace/visibility'
import type { ProductStatus } from '@/lib/commerce/types'

// Operator actions for the Marketplace admin (Shop catalog, orders, T&S). Platform-staff
// gated (web_role admin/janitor, OR the 'platform' staff domain). The first-party Shop is
// operator-managed; orders/reports are oversight surfaces.

async function requireOperator() {
  await authorizeAction(await getCallerProfile(), 'admin', 'platform')
}

function priceCentsFromForm(v: FormDataEntryValue | null): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0
}

/** Create a first-party (platform) Shop product. Lands as a draft; publish to go live. */
export async function createShopProductAction(formData: FormData): Promise<void> {
  await requireOperator()
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return
  const product = await createProduct({
    ownerKind: 'platform',
    vertical: 'shop',
    title,
    description: (formData.get('description') as string) || null,
    category: (formData.get('category') as string) || null,
    priceCents: priceCentsFromForm(formData.get('price')),
    stock: formData.get('stock') ? Number(formData.get('stock')) : null,
  })
  revalidatePath('/admin/marketplace')
  if (product) redirect(`/admin/marketplace/${product.id}`)
}

export async function updateShopProductAction(id: string, formData: FormData): Promise<void> {
  await requireOperator()
  await updateProduct(id, {
    title: String(formData.get('title') ?? '').trim(),
    description: (formData.get('description') as string) || null,
    category: (formData.get('category') as string) || null,
    priceCents: priceCentsFromForm(formData.get('price')),
    stock: formData.get('stock') ? Number(formData.get('stock')) : null,
  })
  revalidatePath('/admin/marketplace')
  revalidatePath(`/admin/marketplace/${id}`)
  redirect('/admin/marketplace')
}

/** Publish / unpublish / archive any catalog product (platform or, for oversight, Space). */
export async function setCatalogStatusAction(id: string, status: ProductStatus): Promise<void> {
  await requireOperator()
  await setProductStatus(id, status)
  revalidatePath('/admin/marketplace')
}

export async function deleteCatalogProductAction(id: string): Promise<void> {
  await requireOperator()
  await deleteProduct(id)
  revalidatePath('/admin/marketplace')
}

/** Refund a paid order (destination charges unwind; platform charges refund normally). */
export async function refundOrderAction(id: string): Promise<void> {
  await requireOperator()
  // refundCommerceOrder reports failure as { error } (payments off, order not found, or a
  // processor error) — throw so the operator sees it instead of a silent "success" that
  // never moved money.
  const res = await refundCommerceOrder(id)
  if (res.error) throw new Error(res.error)
  revalidatePath('/admin/marketplace/orders')
}

/** Triage a marketplace report (reviewing / actioned / dismissed). */
export async function moderateReportAction(id: string, status: ReportStatus): Promise<void> {
  await requireOperator()
  await setReportStatus(id, status)
  revalidatePath('/admin/marketplace/reports')
}

/** Publish / hide a whole marketplace area. Hidden = invisible to members (nav + page),
 *  still visible + editable by operators. Audited via setPlatformFlag. */
export async function setAreaVisibilityAction(area: MarketArea, published: boolean): Promise<void> {
  await requireOperator()
  const profile = await getCallerProfile()
  await setPlatformFlag(areaFlagKey(area), published, { changedBy: profile?.id ?? null, source: 'admin' })
  revalidatePath('/admin/marketplace')
  // The shell reads the flag per request, so nav/pages pick it up on the next navigation.
}
