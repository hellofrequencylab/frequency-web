import { cache } from 'react'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import type { Capability } from '@/lib/core/capabilities'

// ONE capability resolution per circle per request.
//
// The circle detail route is a shell layout plus tab pages (PAGE-FRAMEWORK §3), and both halves
// need the same answer: the layout gates the admin row, the draft 404 and the tab strip on it, and
// the Home tab gates the health panel and the runnable-Journey list on it. getCircleCapabilities is
// not memoized (it takes an options bag, so a blanket cache() around it would miss for every caller
// that passes one), and it costs two or three reads. This is the detail route's own cached handle
// for the no-options form: the second caller in a request gets a memo hit, so splitting the page in
// two cost nothing.
//
// Deliberately NOT in lib/circles/store.ts: this pulls the capability resolver onto whatever imports
// it, and store.ts is imported by Space profile blocks that have no business paying for it.
export const circleCapabilities = cache(
  (circleId: string): Promise<Set<Capability>> => getCircleCapabilities(circleId),
)
