import { z } from 'zod'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { listNearbyNodes, MAX_RADIUS_M } from '@/lib/engagement/nearby'

// GET /api/v1/nodes/nearby?lat=&lng=&radius= (LIVE-721): the live nodes near the caller, so the app
// can register geofences. Reads nodes_geo through lib/engagement/nearby.ts, which never returns a
// secret or a Ghost node's exact point and caps the radius and the count. Signed-in only: the list
// is for members playing the Quest, not a public map of every plaque.

export const dynamic = 'force-dynamic'

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(50).max(MAX_RADIUS_M).default(1500),
})

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'nodes-nearby', { limit: 60, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const { lat, lng, radius } = readInput(query, Object.fromEntries(new URL(request.url).searchParams))
    return ok({ items: await listNearbyNodes({ lat, lng }, radius) })
  } catch (e) {
    return failFrom(e)
  }
}
