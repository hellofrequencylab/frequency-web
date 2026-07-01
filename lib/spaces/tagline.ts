import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// Read the not-yet-typed `tagline` column for a Space id (ADR-246). Fail-safe to null so a caller
// renders without a subtitle line rather than throwing. React.cache'd (PERF-5) so the profile
// layout's generateMetadata and the profile chrome share ONE fetch per request.
export const readTagline = cache(async (spaceId: string): Promise<string | null> => {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('tagline')
      .eq('id', spaceId)
      .maybeSingle()) as { data: { tagline?: string | null } | null }
    const tagline = data?.tagline?.trim()
    return tagline ? tagline : null
  } catch {
    return null
  }
})
