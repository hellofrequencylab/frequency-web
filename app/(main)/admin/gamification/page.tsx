import { requireAdmin } from '@/lib/admin/guard'
import { FqStandingBody } from '@/components/frequency/admin/pages/standing/standing-body'

// GAMIFICATION — achievements, challenges, and engagement stats as an operator surface (ADR-233 §3.3),
// drawn as the Member Admin Standing page, which keeps every module as its own controls.
//
// STAFF-GATED: the host floor OR a community staff role (the gate on the first line of the page).
// The reward editor self-gates further to the web_role janitor axis (getJanitor), the SAME axis the
// reward + season server actions enforce, so the UI affordance and the action gate agree.
export const dynamic = 'force-dynamic'

export default async function AdminGamificationPage() {
  await requireAdmin('host', { staff: 'community' })
  return <FqStandingBody />
}
