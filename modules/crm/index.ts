// The CRM module's public API (PROG-A1, App Platform A1). Everything outside this module imports CRM
// through here, never from modules/crm/components/* (the ESLint import-boundary rule in
// eslint.config.mjs enforces it). Server entry: pages and server components. A client component uses
// `@/modules/crm/client`, so a server-only component never lands in a client bundle.
//
// The module's files live in modules/crm/components.

export { SpaceConversationCompose } from '@/modules/crm/components/space-conversation-compose'
export { SharedContactsView } from '@/modules/crm/components/shared-contacts-view'
export { SpacePipeline } from '@/modules/crm/components/space-pipeline'
export { CrmFunnelPanel } from '@/modules/crm/components/crm-funnel-panel'
export { SpaceContacts } from '@/modules/crm/components/space-contacts'
export { CrmViewTabs, crmConversationsHref, type CrmView } from '@/modules/crm/components/crm-view-tabs'
export { SpaceTasks } from '@/modules/crm/components/space-tasks'
export { ImportContactsForm } from '@/modules/crm/components/import-contacts-form'
export { SegmentFieldsManager } from '@/modules/crm/components/segment-fields-manager'
export { SpaceContactDetail } from '@/modules/crm/components/space-contact-detail'
export { SpaceStageList } from '@/modules/crm/components/space-stage-list'
export { SpaceResonanceCrm } from '@/modules/crm/components/space-resonance-crm'
