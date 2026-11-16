// CRM module: the client-safe public API (PROG-A1). Only components that are fine in a client bundle.
export { SpaceMemberComposer } from '@/modules/crm/components/space-member-composer'
// The Space contact search the "send to specific people" panel uses (a 'use server' action: client-safe RPC).
export {
  searchSpaceMemberRecipientsAction,
  type SpaceRecipientOption,
} from '@/modules/crm/components/space-member-composer-actions'
