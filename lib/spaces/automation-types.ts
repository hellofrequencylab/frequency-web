// PER-SPACE AUTOMATION — the CLIENT-SAFE types + constants (R5). This module has NO server-only import
// (no admin client, no next/headers, no auth): only value constants and TYPE declarations, so a CLIENT
// component (the automation editors) can import the trigger/action lists + the row shapes WITHOUT pulling
// the server-only IO module (lib/spaces/automation.ts, which imports createAdminClient -> next/headers)
// into the client bundle. The IO module + the pure validators live in lib/spaces/automation.ts and
// RE-EXPORT these, so server code keeps a single import surface.
//
// `AudienceFilter` is imported TYPE-ONLY (it is erased at build), so this module stays free of the
// server-only createAdminClient that lib/spaces/audiences.ts carries.

import type { AudienceFilter } from '@/lib/spaces/audiences'

/** The events a Space rule can trigger on. Space-scoped analogues of the root engagement triggers,
 *  phrased in operator terms. Free-text in the DB (no enum) so adding a trigger needs no migration; the
 *  validator gates writes to this known list. Today these are the shape the UI offers; the runner that
 *  fires them off Space CRM events is a follow-on (the rule is persisted + editable now). */
export const SPACE_AUTOMATION_TRIGGERS = [
  'contact.created', // a new contact enters this Space's CRM
  'contact.tagged', // a contact gains a tag
  'deal.stage_changed', // a contact/deal moves pipeline stage
  'member.joined', // someone joins a membership tier
] as const
export type SpaceAutomationTrigger = (typeof SPACE_AUTOMATION_TRIGGERS)[number]

/** The actions a Space rule can take. Today only 'email_audience' (send an email to a resolved
 *  audience). Free-text in the DB; the validator gates writes to this list. */
export const SPACE_AUTOMATION_ACTIONS = ['email_audience'] as const
export type SpaceAutomationAction = (typeof SPACE_AUTOMATION_ACTIONS)[number]

/** The action payload for 'email_audience': who to email + the email itself. */
export interface EmailAudienceConfig {
  audience: AudienceFilter
  subject: string
  body: string
}

/** One automation rule as the app consumes it (camelCased). */
export interface SpaceAutomationRule {
  id: string
  name: string
  triggerEvent: SpaceAutomationTrigger
  actionType: SpaceAutomationAction
  config: EmailAudienceConfig
  enabled: boolean
  createdAt: string | null
}

/** One step of a drip sequence (camelCased). */
export interface SpaceDripStep {
  id: string
  order: number
  delayHours: number
  subject: string
  body: string
  enabled: boolean
}

/** One drip sequence with its ordered steps. */
export interface SpaceDripSequence {
  id: string
  name: string
  audience: AudienceFilter
  enabled: boolean
  steps: SpaceDripStep[]
  createdAt: string | null
}
