// Attach the Journey sales path to catalog rows so Market and Shop cards do not invent a
// second listing URL. PURE mapping once the slugs are loaded; the read is one `in()` query.

import { createAdminClient } from '@/lib/supabase/admin'
import { journeyMemberPath } from '@/lib/journeys/sales-path'

type CatalogRow = {
  productKind: string
  journeyPlanId?: string | null
  href?: string
}

export async function withJourneySalesHref<T extends CatalogRow>(items: T[]): Promise<T[]> {
  const planIds = [
    ...new Set(
      items
        .filter((item) => item.productKind === 'journey' && item.journeyPlanId)
        .map((item) => item.journeyPlanId as string),
    ),
  ]
  if (planIds.length === 0) return items

  const { data } = await createAdminClient()
    .from('journey_plans')
    .select('id, slug')
    .in('id', planIds)
  const slugs = new Map(
    ((data ?? []) as { id: string; slug: string }[]).map((row) => [row.id, row.slug]),
  )

  return items.map((item) => {
    if (item.productKind !== 'journey' || !item.journeyPlanId) return item
    const slug = slugs.get(item.journeyPlanId)
    if (!slug) return item
    return { ...item, href: journeyMemberPath(slug) }
  })
}
