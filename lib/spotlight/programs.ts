import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'
import {
  EMPTY_PROGRAMS,
  anyProgramsOn,
  shapePrograms,
  type CircleRow,
  type PlanRow,
  type ProgramsOptIn,
  type SpaceRow,
  type SpotlightPrograms,
} from './programs.shared'

// WHAT I'M PART OF (SPL-04), the IO half. One admin read per kind the member switched on, run in parallel,
// each a membership row joined to its public face with an EXPLICIT column list (never select('*')). A kind
// the member left off is never read. The query predicates narrow the rows and shapePrograms re-checks every
// one, so a predicate lost in a refactor still cannot publish a private Circle, Space or Journey.
//
// FAIL CLOSED: any error in a read becomes an empty list for that kind, and the block collapses. A transient
// failure must never print a false statement about the member, and never a private row.

const READ_LIMIT = 24

type Rows = { data: unknown; error: unknown }
const NONE: Rows = { data: [], error: null }
const rowsOf = <T,>(r: Rows): T[] => (r.error || !Array.isArray(r.data) ? [] : (r.data as T[]))

export async function getMemberPrograms(profileId: string, want: ProgramsOptIn): Promise<SpotlightPrograms> {
  if (!anyProgramsOn(want)) return EMPTY_PROGRAMS
  try {
    const admin = createAdminClient()
    const rootSpaceId = await loadRootSpaceId()

    const circles: PromiseLike<Rows> = want.circles
      ? admin
          .from('memberships')
          .select('circles!circle_id!inner ( id, name, slug, unlisted, access, status, space_id )')
          .eq('profile_id', profileId)
          .eq('status', 'active')
          .eq('circles.access', 'open')
          .eq('circles.unlisted', false)
          .in('circles.status', ['forming', 'active'])
          .limit(READ_LIMIT)
      : Promise.resolve(NONE)

    const spaces: PromiseLike<Rows> = want.spaces
      ? admin
          .from('space_members')
          .select('spaces!space_id!inner ( id, name, slug, visibility, status, network_connected, type )')
          .eq('profile_id', profileId)
          .eq('status', 'active')
          .eq('spaces.status', 'active')
          .eq('spaces.visibility', 'network')
          .eq('spaces.network_connected', true)
          .neq('spaces.type', 'root')
          .limit(READ_LIMIT)
      : Promise.resolve(NONE)

    const journeys: PromiseLike<Rows> = want.journeys
      ? admin
          .from('journey_enrollments')
          .select(
            'completed_at, journey_plans!plan_id!inner ( id, title, slug, visibility, status, published_at, space_id, ongoing )',
          )
          .eq('profile_id', profileId)
          .eq('journey_plans.visibility', 'public')
          .eq('journey_plans.status', 'approved')
          .not('journey_plans.published_at', 'is', null)
          .order('started_at', { ascending: false })
          .limit(READ_LIMIT)
      : Promise.resolve(NONE)

    const [c, s, j] = await Promise.all([circles, spaces, journeys])

    return shapePrograms(
      {
        circles: rowsOf<{ circles: CircleRow | null }>(c).map((r) => r.circles ?? null),
        spaces: rowsOf<{ spaces: SpaceRow | null }>(s).map((r) => r.spaces ?? null),
        journeys: rowsOf<{ completed_at: string | null; journey_plans: PlanRow | null }>(j).map((r) => ({
          plan: r.journey_plans ?? null,
          completed_at: r.completed_at ?? null,
        })),
      },
      rootSpaceId,
    )
  } catch {
    return EMPTY_PROGRAMS
  }
}
