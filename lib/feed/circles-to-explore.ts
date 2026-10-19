import { createClient } from '@/lib/supabase/server'
import { LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { milesBetween } from '@/lib/feed/home-rank'

// CIRCLES TO EXPLORE (LIVE-1022). The Feed's "go and look" band: up to three live, listed Circles the
// member is not in, nearest first when they have a home base, busiest first otherwise. One bounded
// read; it fails quiet, because a missing band must never take the Feed down.

interface ExploreCircle {
  id: string
  slug: string
  name: string
  about: string | null
  imageUrl: string | null
  memberCount: number
  place: string | null
  distanceMi: number | null
}

export async function loadCirclesToExplore(args: {
  mine: string[]
  home: { lat: number; lng: number } | null
  limit?: number
}): Promise<ExploreCircle[]> {
  const limit = args.limit ?? 3
  try {
    const supabase = await createClient()
    let q = supabase
      .from('circles')
      .select('id, slug, name, about, image_url, member_count, neighborhood, latitude, longitude')
      .in('status', [...LISTABLE_CIRCLE_STATUS])
      .eq('unlisted', false)
      .order('member_count', { ascending: false })
      .limit(80)
    if (!(await demoModeEnabled()) || (await viewerHidesDemo())) q = q.eq('is_demo', false)
    const { data, error } = await q
    if (error || !data) return []
    const mine = new Set(args.mine)
    const rows = (data as unknown as {
      id: string
      slug: string
      name: string
      about: string | null
      image_url: string | null
      member_count: number | null
      neighborhood: string | null
      latitude: number | null
      longitude: number | null
    }[])
      .filter((c) => !mine.has(c.id))
      .map((c): ExploreCircle => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        about: c.about,
        imageUrl: c.image_url,
        memberCount: c.member_count ?? 0,
        place: c.neighborhood,
        distanceMi:
          args.home && c.latitude != null && c.longitude != null
            ? milesBetween(args.home, { lat: c.latitude, lng: c.longitude })
            : null,
      }))
    if (args.home) {
      rows.sort((a, b) => (a.distanceMi ?? 1e9) - (b.distanceMi ?? 1e9) || b.memberCount - a.memberCount)
    }
    return rows.slice(0, limit)
  } catch {
    return []
  }
}
