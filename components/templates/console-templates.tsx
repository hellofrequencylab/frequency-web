import type { ComponentProps } from 'react'
import { AdminPageFrame } from '@/components/frequency/admin/admin-page-frame'
import type { FocusTemplate } from './focus-template'
import type { DashboardTemplate } from './dashboard-template'

// THE SPACE CONSOLE'S PAGE TEMPLATES. The Space settings, CRM and manage pages render inside the Frequency
// admin shell (their layouts wrap them in FrequencySpaceConsole), so they wear the shell's page frame
// (AdminPageFrame: the design's head, the page's own content beneath). Each takes the props of the template
// it names. Only console routes import these (the Space settings, CRM and manage pages, and the five /admin
// pages that use a Focus or Dashboard shell).

/** FocusTemplate for a console page: a single task, kept to a readable column in the frame. */
export function ConsoleFocusTemplate({
  consoleMeasure = 'focus',
  headless = false,
  ...props
}: ComponentProps<typeof FocusTemplate> & {
  /** Frequency only: 'full' lets a page that is a working surface rather than a form (the Calendar
   *  planner) use the console's whole width. */
  consoleMeasure?: 'focus' | 'full'
  /** Frequency only: the title stays for screen readers and the surface starts at the top. */
  headless?: boolean
}) {
  const { eyebrow, title, description, actions, back, children } = props
  return (
    <AdminPageFrame kicker={eyebrow} title={title} meta={description} actions={actions} back={back} measure={consoleMeasure} headless={headless}>
      {children}
    </AdminPageFrame>
  )
}

/** DashboardTemplate for a console page: the stat row becomes the frame's KPI row, the banner stays above. */
export function ConsoleDashboardTemplate(props: ComponentProps<typeof DashboardTemplate>) {
  const { eyebrow, title, description, actions, back, stats, banner, children } = props
  return (
    <AdminPageFrame kicker={eyebrow} title={title} meta={description} actions={actions} back={back} stats={stats} banner={banner}>
      {children}
    </AdminPageFrame>
  )
}
