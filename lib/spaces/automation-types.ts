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

// ── PRE-BUILT TEMPLATES (ADR-796) ─────────────────────────────────────────────────────────────────
// The blank-canvas Rules builder was removed (open-canvas automation is the named adoption killer);
// these ready-made sequences replace it. A template instantiates a real drip sequence (created OFF, so
// the operator reviews the steps before it sends) plus, for a triggered template, a rule that auto-
// enrolls the right member when its event fires. The operator's on/off switch is the SEQUENCE toggle:
// the runner enrolls nobody while the sequence is off, so turning the sequence on is what goes live.

/** One step of a template (a subject + body + how long to wait before it sends). */
export interface SpaceAutomationTemplateStep {
  subject: string
  body: string
  delayHours: number
}

/** A ready-made sequence an operator can add in one tap. `triggerEvent` set = it auto-enrolls the
 *  matching member when that Space event fires (today only 'member.joined'); null = there is no auto
 *  trigger, so the operator starts it by hand over a chosen audience (e.g. a win-back for quiet
 *  members). `name` is the sequence name it creates (also the dedupe key). Client-safe (no IO). */
export interface SpaceAutomationTemplate {
  id: string
  /** The card title in the picker. */
  title: string
  /** The sequence name this creates (and the dedupe key: a template already added is not added twice). */
  name: string
  /** One plain line: what it does and when it sends. */
  description: string
  /** The Space event that auto-enrolls a member, or null for a manual-start sequence. */
  triggerEvent: SpaceAutomationTrigger | null
  steps: SpaceAutomationTemplateStep[]
}

/** The template catalog. Copy follows docs/CONTENT-VOICE.md: plain sentences, no em/en dashes, no
 *  narrating the reader's feelings, sentence case. Every step is a starting point the operator edits. */
export const SPACE_AUTOMATION_TEMPLATES: readonly SpaceAutomationTemplate[] = [
  {
    id: 'welcome',
    title: 'Welcome new members',
    name: 'Welcome new members',
    description: 'Sends automatically when someone joins. A short hello now, then a check-in a few days later.',
    triggerEvent: 'member.joined',
    steps: [
      {
        delayHours: 0,
        subject: 'Welcome, glad you are here',
        body: 'Thanks for joining. You now have access to everything here.\n\nTake a look around when you have a few minutes, and reply to this email if you have a question. We read every one.',
      },
      {
        delayHours: 72,
        subject: 'Anything you are looking for?',
        body: 'It has been a few days since you joined.\n\nIf there is something specific you wanted to find or do here, reply and tell us. We will point you in the right direction.',
      },
    ],
  },
  {
    id: 'onboarding',
    title: 'First-week onboarding',
    name: 'First-week onboarding',
    description: 'Sends automatically when someone joins. A three-part guide across their first week.',
    triggerEvent: 'member.joined',
    steps: [
      {
        delayHours: 0,
        subject: 'Start here',
        body: 'Welcome. Here is the one thing worth doing first: fill out your profile so we know who you are. It takes about two minutes.\n\nOnce that is done, have a look at what is on offer and pick one thing to try.',
      },
      {
        delayHours: 48,
        subject: 'A couple of things people miss',
        body: 'Two days in, here are a few things that are easy to overlook at the start.\n\nCheck your notification settings so you hear from us the way you want, and browse the full list of what is available. Reply if anything is unclear.',
      },
      {
        delayHours: 168,
        subject: 'One week in',
        body: 'You have been here a week.\n\nIf anything has been hard to find or did not work the way you expected, reply and tell us. We use it to make this better.',
      },
    ],
  },
  {
    id: 're-engage',
    title: 'Win back quiet members',
    name: 'Win back quiet members',
    description: 'For members who have gone quiet. No auto trigger. Start it by hand over a chosen audience.',
    triggerEvent: null,
    steps: [
      {
        delayHours: 0,
        subject: 'We have not seen you in a while',
        body: 'It has been a while since you were last active here.\n\nWe wanted to check in. If you are still interested, reply and we will help you find your footing again. If not, that is alright.',
      },
      {
        delayHours: 96,
        subject: 'Still around?',
        body: 'One more note, then we will leave it.\n\nIf you want to pick back up, reply to this and we will point you to what is new. If you would rather step away, you can do that any time.',
      },
    ],
  },
] as const
