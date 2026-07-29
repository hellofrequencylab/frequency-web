// The page-template kit. Every interior page picks ONE of these shells and fills
// slots — it never hand-rolls a header or a layout. See docs/PAGE-FRAMEWORK.md §3
// for the decision tree (what content → which template) and lib/layout/
// page-chrome.ts for the matching rail treatment.

export { PageHeading } from './page-heading'
export { PageHero, HERO_ACTION_CLASS, HERO_ACTION_CLASS_ADAPTIVE, type PageHeroProps, type PageHeroVariant, type PageHeroSize, type HeroOverlayStyle, type HeroZoneName } from './page-hero'
export { IndexTemplate } from './index-template'
export { StreamTemplate } from './stream-template'
export { DetailTemplate, type DetailTab } from './detail-template'
// The standard block layout for every page-like EVENT surface — a composition of DetailTemplate,
// not a sixth shell. See components/templates/event-detail-template.tsx.
export {
  EventDetailTemplate,
  type EventDetailTemplateProps,
  type EventIdentitySlots,
} from './event-detail-template'
export { FocusTemplate } from './focus-template'
export { WizardShell, wizardPrimaryClass, wizardSecondaryClass } from './wizard-shell'
export { WizardProgress } from './wizard-progress'
export { DashboardTemplate } from './dashboard-template'
export { HeaderSidebarTemplate } from './header-sidebar-template'
export { TwoColumnTemplate } from './two-column-template'
export { RailGrid } from './rail-grid'
export { AdminTemplate, AdminSection } from './admin-template'
