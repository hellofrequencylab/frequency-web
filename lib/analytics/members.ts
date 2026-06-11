import { createAdminClient } from '@/lib/supabase/admin'

// The canonical "member" population for every admin count.
//
// A member is a real, non-system PERSON profile — someone who joined Frequency, not
// only someone already placed in a circle. Counting profiles (not `memberships`)
// keeps the headcount consistent everywhere it appears (the top stat, Pulse "Member
// growth", the live rail, the activation denominator) instead of mixing two
// populations. Service accounts like @moderation / Vera carry `is_system = true`
// (NOT NULL, default false) and never count.
export async function countMembers(): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_system', false)
  return count ?? 0
}
