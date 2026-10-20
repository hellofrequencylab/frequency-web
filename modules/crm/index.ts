// The CRM module's public API (PROG-A1, App Platform A1). Everything outside this module imports CRM
// through here, never from components/spaces/crm/* (the ESLint import-boundary rule in
// eslint.config.mjs enforces it). Server entry: pages and server components. A client component uses
// `@/modules/crm/client`, so a server-only component never lands in a client bundle.
//
// The files still live under components/spaces/crm; moving them under modules/crm/components is a
// later slice of A1 and changes no import outside this barrel.

export { SpaceConversationCompose } from '@/components/spaces/crm/space-conversation-compose'
export { SharedContactsView } from '@/components/spaces/crm/shared-contacts-view'
export { SpacePipeline } from '@/components/spaces/crm/space-pipeline'
export { CrmFunnelPanel } from '@/components/spaces/crm/crm-funnel-panel'
export { SpaceContacts } from '@/components/spaces/crm/space-contacts'
export { CrmViewTabs, crmConversationsHref, type CrmView } from '@/components/spaces/crm/crm-view-tabs'
export { SpaceTasks } from '@/components/spaces/crm/space-tasks'
export { ImportContactsForm } from '@/components/spaces/crm/import-contacts-form'
export { SegmentFieldsManager } from '@/components/spaces/crm/segment-fields-manager'
export { SpaceContactDetail } from '@/components/spaces/crm/space-contact-detail'
export { SpaceStageList } from '@/components/spaces/crm/space-stage-list'
export { SpaceResonanceCrm } from '@/components/spaces/crm/space-resonance-crm'
