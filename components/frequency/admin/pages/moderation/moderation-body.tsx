import { loadModerationReports } from '@/components/widgets/admin/admin-moderation-queue'
import { AdminHead, AdminPageBody, EMPTY, n } from '../shared'
import { ReportQueue } from './report-queue'

// MODERATION, FREQUENCY (design_handoff/frequency/templates/admin/Moderation.html). /admin/moderation under
// SITE_DESIGN=frequency; DAWN keeps the module-driven queue. The route's gate (requireAdmin host or
// community staff) ran first, and the reports are the DAWN queue's own read (loadModerationReports), scoped
// to what this viewer may act on: platform moderators see every pending report, a Circle host sees reports
// in the Circles they host. The cards call the same server actions as the DAWN queue.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"): the median response time. The design's Resolved, Blocked
// and Rules tabs and the House rules editor have no reader or action here, so they are not drawn.

export async function FqModerationBody() {
  const reports = await loadModerationReports()
  return (
    <AdminPageBody>
      <AdminHead
        kicker="Reports and member safety"
        title="Moderation"
        meta={`${n(reports.length)} open · median response ${EMPTY}`}
      />
      <ReportQueue reports={reports} />
    </AdminPageBody>
  )
}
