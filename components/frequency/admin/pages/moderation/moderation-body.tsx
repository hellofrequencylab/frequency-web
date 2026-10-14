import { loadModerationReports } from '@/components/widgets/admin/admin-moderation-queue'
import { AdminHead, AdminPageBody, EMPTY, n } from '../shared'
import { ReportQueue } from './report-queue'
import { loadBlockedMembers, loadResolvedReports, medianResponseHours, responseLabel } from './moderation-reads'

// MODERATION, FREQUENCY (design_handoff/frequency/templates/admin/Moderation.html). /admin/moderation under
// SITE_DESIGN=frequency; DAWN keeps the module-driven queue. The route's gate (requireAdmin host or
// community staff) ran first, and the reports are the DAWN queue's own read (loadModerationReports), scoped
// to what this viewer may act on: platform moderators see every pending report, a Circle host sees reports
// in the Circles they host. The cards call the same server actions as the DAWN queue. The Resolved and
// Blocked tabs and the median response read moderation-reads.ts under the same scoping.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"): the median response when no resolved report carries a
// review time. There is no rules editor, so House rules opens the community guidelines.

export async function FqModerationBody() {
  const [reports, resolved, blocked] = await Promise.all([loadModerationReports(), loadResolvedReports(), loadBlockedMembers()])
  const median = medianResponseHours(resolved)
  return (
    <AdminPageBody>
      <AdminHead
        kicker="Reports and member safety"
        title="Moderation"
        meta={`${n(reports.length)} open · median response ${median === null ? EMPTY : responseLabel(median)}`}
      />
      <ReportQueue reports={reports} resolved={resolved} blocked={blocked} />
    </AdminPageBody>
  )
}
