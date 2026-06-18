// Shared, request-cached read for the practice DETAIL page's layout modules (ADR-270/294). The
// detail blocks (stats · about · guide · used-in) are arranged by the operator, so they each
// self-fetch — but the practice id is a ROUTE PARAM a nested module never receives. It's read from
// the `x-pathname` header the proxy stamps; React.cache shares the one fetch across the blocks AND
// the page header. Server-only.

import { cache } from 'react'
import { headers } from 'next/headers'
import { getRankedPractice } from '@/lib/practices'

/** The id from a `/practices/<id>` pathname, or null off a detail route. */
async function detailId(): Promise<string | null> {
  const pathname = (await headers()).get('x-pathname') ?? ''
  const parts = pathname.split('/').filter(Boolean) // ['practices', '<id>']
  return parts[0] === 'practices' && parts[1] && parts.length === 2 ? parts[1] : null
}

/** The practice for the current detail route (cached), or null when there's no id / no practice. */
export const getDetailPractice = cache(async () => {
  const id = await detailId()
  if (!id) return null
  return getRankedPractice(id)
})
