import type { ComponentProps } from 'react'
import { SITE_DESIGN } from '@/lib/theme/design'
import { AdminPageFrame } from '@/components/frequency/admin/admin-page-frame'
import { FocusTemplate } from './focus-template'
import { DashboardTemplate } from './dashboard-template'

// THE SPACE CONSOLE'S PAGE TEMPLATES. The Space settings, CRM and manage pages render inside the Frequency
// admin shell under SITE_DESIGN=frequency (their layouts wrap them in FrequencySpaceConsole), so there they
// wear the shell's page frame (AdminPageFrame: the design's head, the page's own content beneath). Under DAWN
// each is exactly the template it names, with the same props, so a DAWN build renders byte for byte what it
// did. Only console routes import these (the Space settings, CRM and manage pages, and the five /admin pages
// that use a Focus or Dashboard shell); FocusTemplate and DashboardTemplate themselves are unchanged for
// every other page.

/** FocusTemplate for a console page: a single task, kept to a readable column in the frame. */
export function ConsoleFocusTemplate({
  consoleMeasure = 'focus',
  ...props
}: ComponentProps<typeof FocusTemplate> & {
  /** Frequency only: 'full' lets a page that is a working surface rather than a form (the Calendar
   *  planner) use the console's whole width. DAWN ignores it. */
  consoleMeasure?: 'focus' | 'full'
}) {
  if (SITE_DESIGN !== 'frequency') return <FocusTemplate {...props} />
  const { eyebrow, title, description, actions, back, children } = props
  return (
    <AdminPageFrame kicker={eyebrow} title={title} meta={description} actions={actions} back={back} measure={consoleMeasure}>
      {children}
    </AdminPageFrame>
  )
}

/** DashboardTemplate for a console page: the stat row becomes the frame's KPI row, the banner stays above. */
export function ConsoleDashboardTemplate(props: ComponentProps<typeof DashboardTemplate>) {
  if (SITE_DESIGN !== 'frequency') return <DashboardTemplate {...props} />
  const { eyebrow, title, description, actions, back, stats, banner, children } = props
  return (
    <AdminPageFrame kicker={eyebrow} title={title} meta={description} actions={actions} back={back} stats={stats} banner={banner}>
      {children}
    </AdminPageFrame>
  )
}
