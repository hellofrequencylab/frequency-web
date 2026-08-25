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
// The standard block layout for every marketplace LISTING detail surface (Classifieds, Housing,
// Market) — an entity composition over ListingHero + the main/side grid, not a ninth shell.
// See components/templates/listing-detail-template.tsx.
export { ListingDetailTemplate } from './listing-detail-template'
export { FocusTemplate } from './focus-template'
export { WizardShell, wizardPrimaryClass, wizardSecondaryClass } from './wizard-shell'
export { WizardProgress } from './wizard-progress'
export { DashboardTemplate } from './dashboard-template'
// (Removed 2026-08-05: HeaderSidebarTemplate + TwoColumnTemplate. Both shipped as kit shells
// and were never composed by a single page. The in-body sidebar geometry lives on as
// DetailTemplate's `sidebar` slot; two peer columns are a grid inside whichever shell the
// content actually is. See docs/PAGE-FRAMEWORK.md §3 + §8.1.)
export { RailGrid } from './rail-grid'
export { AdminTemplate, AdminSection } from './admin-template'
