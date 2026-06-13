import { createClient } from '@/lib/supabase/server'

// Connection metrics reads (ADR-186, P6). your_impact is keyed to auth.uid() so it
// runs on the authed client; circle_momentum returns aggregate counts. Neither is in
// the generated types yet → untyped cast (repo convention).

export interface YourImpact {
  /** People you captured who became members. */
  brought: number
  /** …who joined AFTER you captured them (a genuine lead conversion). */
  activated: number
  /** Avg days from capture to joining, for activated leads. */
  avgDaysToActivate: number | null
  /** …who went on to form at least one connection (you brought connectors). */
  catalysts: number
}

export async function getYourImpact(): Promise<YourImpact | null> {
  const supabase = (await createClient())
  const { data, error } = await supabase.rpc('your_impact')
  if (error || !Array.isArray(data) || data.length === 0) return null
  const r = data[0] as Record<string, unknown>
  const impact: YourImpact = {
    brought: Number(r.brought ?? 0),
    activated: Number(r.activated ?? 0),
    avgDaysToActivate: r.avg_days_to_activate == null ? null : Number(r.avg_days_to_activate),
    catalysts: Number(r.catalysts ?? 0),
  }
  // Nothing to show until you've actually brought someone in.
  return impact.brought > 0 ? impact : null
}

export interface CircleMomentum {
  members: number
  newMembers7d: number
  newTies7d: number
  upcomingEvents: number
}

export async function getCircleMomentum(circleId: string): Promise<CircleMomentum | null> {
  const supabase = (await createClient())
  const { data, error } = await supabase.rpc('circle_momentum', { _circle: circleId })
  if (error || !Array.isArray(data) || data.length === 0) return null
  const r = data[0] as Record<string, unknown>
  return {
    members: Number(r.members ?? 0),
    newMembers7d: Number(r.new_members_7d ?? 0),
    newTies7d: Number(r.new_ties_7d ?? 0),
    upcomingEvents: Number(r.upcoming_events ?? 0),
  }
}
