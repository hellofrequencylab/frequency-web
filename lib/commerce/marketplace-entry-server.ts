// Server-only half of LIVE-220: resolve a commerce product to the Journey slug the
// proxy may have stamped. Kept out of marketplace-entry.ts so proxy.ts stays edge-safe.

import { createAdminClient } from '@/lib/supabase/admin'

export async function journeySlugForProduct(productId: string): Promise<string | null> {
  if (!productId) return null
  const db = createAdminClient()
  const { data: product } = await db
    .from('commerce_products')
    .select('journey_plan_id')
    .eq('id', productId)
    .maybeSingle()
  const planId = (product as { journey_plan_id?: string | null } | null)?.journey_plan_id
  if (!planId) return null
  const { data: plan } = await db.from('journey_plans').select('slug').eq('id', planId).maybeSingle()
  const slug = (plan as { slug?: string | null } | null)?.slug
  return slug && slug.length > 0 ? slug : null
}
