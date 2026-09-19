import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'

// Viewer-aware Space resolve for (main) /spaces/[slug] owner surfaces and /full.
// Sitemap share URLs no longer render that layout (SCAN-644 / ADR-1465). Kept
// out of app/(main)/spaces/[slug]/layout.tsx so that file cannot void the
// public body by calling getMyProfileId during its own render.

export async function getVisibleSpaceForRequest(slug: string): Promise<Space | null> {
  const viewerProfileId = await getMyProfileId()
  return getVisibleSpaceBySlug(slug, viewerProfileId)
}
