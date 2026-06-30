// Per-persona funnel templates (Growth OS Engine 2, GE2-4, ADR-455). A template is
// the starting point an operator clones into a real `funnels` row: it names the four
// canonical stages, suggests a goal event, and pre-wires each stage to an existing
// component (a lead flow, a campaign, a page) where the default is obvious. The
// operator then tunes the cloned funnel in the builder without a deploy.
//
// Code-first (the lib/entry-points/templates.ts + lib/onboarding/lead-flows.ts
// pattern): type-safe, reviewed in PRs, and a DB-override layer can come later
// without changing callers. Client-safe (no server imports) so the builder UI reads
// it directly. Strings pass CONTENT-VOICE (plain, no em dashes, proper nouns carry
// the magic).

import type { PersonaId } from '@/lib/onboarding/personas'

/** The four canonical stages of every funnel (mirrors the funnel_stages.kind check). */
export type FunnelStageKind = 'entry' | 'wedge' | 'capture' | 'convert'

export const FUNNEL_STAGE_ORDER: FunnelStageKind[] = ['entry', 'wedge', 'capture', 'convert']

/** Plain labels + one-line meaning for each stage kind (operator-facing). */
export const STAGE_KIND_META: Record<FunnelStageKind, { label: string; blurb: string }> = {
  entry: { label: 'Entry', blurb: 'Where someone first finds the funnel: a QR code, a link, a campaign.' },
  wedge: { label: 'Wedge', blurb: 'The landing or pitch that earns the next click.' },
  capture: { label: 'Capture', blurb: 'Where you learn who they are: a lead flow or a form.' },
  convert: { label: 'Convert', blurb: 'The goal that counts as a win for this funnel.' },
}

/** The typed component families a stage can point at (mirrors funnel_stage_links.ref_type). */
export type StageRefType = 'entry_point' | 'campaign' | 'page' | 'lead_flow' | 'nurture' | 'custom'

export const REF_TYPE_META: Record<StageRefType, { label: string; pointer: 'id' | 'key' }> = {
  entry_point: { label: 'Entry point', pointer: 'id' },
  campaign: { label: 'Campaign', pointer: 'id' },
  page: { label: 'Page', pointer: 'key' },
  lead_flow: { label: 'Lead flow', pointer: 'key' },
  nurture: { label: 'Nurture sequence', pointer: 'id' },
  custom: { label: 'Custom link', pointer: 'key' },
}

/** A suggested stage in a template: its kind, a label, and (optionally) a default
 *  link to an existing component the operator can keep or replace. */
export interface TemplateStage {
  kind: FunnelStageKind
  label: string
  /** A default soft reference; key-pointer types (page/lead_flow/custom) only, since
   *  uuid-pointer components (entry points, campaigns, sequences) are operator-created
   *  and have no stable seed id. */
  link?: { refType: Extract<StageRefType, 'page' | 'lead_flow' | 'custom'>; refKey: string }
}

export interface FunnelTemplate {
  key: string
  label: string
  /** One-line "what this funnel is for" on the template card. */
  blurb: string
  /** Which persona this funnel is built for (drives funnels.persona). */
  persona: PersonaId
  /** The engagement_events.event_type a conversion is measured against. */
  goalEvent: string
  stages: TemplateStage[]
}

// ── The seed templates, one per active persona ────────────────────────────────
// Each pre-wires the wedge to a lead flow (lib/onboarding/lead-flows.ts) and the
// capture to the same flow's email step; entry + convert are left for the operator
// to wire to their own campaign and to confirm the goal event.
export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  {
    key: 'visitor-belong',
    label: 'Visitor: find your people',
    blurb: 'For someone just looking to belong. Lands on the welcome flow and converts on signup.',
    persona: 'visitor',
    goalEvent: 'signup',
    stages: [
      { kind: 'entry', label: 'QR or shared link' },
      { kind: 'wedge', label: 'Welcome landing', link: { refType: 'lead_flow', refKey: 'welcome' } },
      { kind: 'capture', label: 'Tell us who you are', link: { refType: 'lead_flow', refKey: 'welcome' } },
      { kind: 'convert', label: 'Signs up' },
    ],
  },
  {
    key: 'practitioner-offer',
    label: 'Practitioner: bring your offering',
    blurb: 'For coaches and practitioners with something to offer. Routes to the practitioner track.',
    persona: 'practitioner',
    goalEvent: 'signup',
    stages: [
      { kind: 'entry', label: 'Profile link or QR' },
      { kind: 'wedge', label: 'Welcome landing', link: { refType: 'lead_flow', refKey: 'welcome' } },
      { kind: 'capture', label: 'Practitioner lead flow', link: { refType: 'lead_flow', refKey: 'welcome' } },
      { kind: 'convert', label: 'Signs up' },
    ],
  },
  {
    key: 'partner-business',
    label: 'Partner: local business',
    blurb: 'For a local spot exploring partnering. Opens the partner track and captures the lead.',
    persona: 'partner',
    goalEvent: 'signup',
    stages: [
      { kind: 'entry', label: 'In-store QR or flyer' },
      { kind: 'wedge', label: 'Partner landing', link: { refType: 'lead_flow', refKey: 'partner' } },
      { kind: 'capture', label: 'Partner lead flow', link: { refType: 'lead_flow', refKey: 'partner' } },
      { kind: 'convert', label: 'Signs up' },
    ],
  },
  {
    key: 'builder-recruit',
    label: 'Builder: recruit a host',
    blurb: 'For recruiting community builders. The event flow, converting on a verified first practice.',
    persona: 'builder',
    goalEvent: 'practice_verified',
    stages: [
      { kind: 'entry', label: 'Event QR or in-person link' },
      { kind: 'wedge', label: 'Event landing', link: { refType: 'lead_flow', refKey: 'event' } },
      { kind: 'capture', label: 'Event lead flow', link: { refType: 'lead_flow', refKey: 'event' } },
      { kind: 'convert', label: 'Hits a verified practice' },
    ],
  },
]

export function getFunnelTemplate(key: string): FunnelTemplate | null {
  return FUNNEL_TEMPLATES.find((t) => t.key === key) ?? null
}
