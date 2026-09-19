// Attach the Journey sales path to catalog rows so Market and Shop cards do not invent a
// second listing URL. The slug read lives in paid.ts (already on the admin-client baseline).

import { journeySlugsByPlanId } from '@/lib/journeys/paid'
import { journeyMemberPath } from '@/lib/journeys/sales-path'

type CatalogRow = {
  productKind: string
  journeyPlanId?: string | null
  href?: string
}

export async function withJourneySalesHref<T extends CatalogRow>(items: T[]): Promise<T[]> {
  const planIds = items
    .filter((item) => item.productKind === 'journey' && item.journeyPlanId)
    .map((item) => item.journeyPlanId as string)
  if (planIds.length === 0) return items

  const slugs = await journeySlugsByPlanId(planIds)

  return items.map((item) => {
    if (item.productKind !== 'journey' || !item.journeyPlanId) return item
    const slug = slugs.get(item.journeyPlanId)
    if (!slug) return item
    return { ...item, href: journeyMemberPath(slug) }
  })
}
