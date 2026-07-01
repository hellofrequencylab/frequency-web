// The page-template kit. Every interior page picks ONE of these shells and fills
// slots — it never hand-rolls a header or a layout. See docs/PAGE-FRAMEWORK.md §3
// for the decision tree (what content → which template) and lib/layout/
// page-chrome.ts for the matching rail treatment.

export { PageHeading } from './page-heading'
export { IndexTemplate } from './index-template'
export { StreamTemplate } from './stream-template'
export { DetailTemplate, type DetailTab } from './detail-template'
export { FocusTemplate } from './focus-template'
export { WizardShell, wizardPrimaryClass, wizardSecondaryClass } from './wizard-shell'
export { WizardProgress } from './wizard-progress'
export { DashboardTemplate } from './dashboard-template'
export { HeaderSidebarTemplate } from './header-sidebar-template'
export { TwoColumnTemplate } from './two-column-template'
export { RailGrid } from './rail-grid'
export { AdminTemplate, AdminSection } from './admin-template'
