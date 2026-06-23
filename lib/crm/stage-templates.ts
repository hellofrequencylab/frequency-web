// PER-SEGMENT STAGE TEMPLATES (CRM-STRATEGY §7, P3). One CRM model, many shapes: the same
// crm_stages primitive, seeded with a DIFFERENT starting pipeline per Space `type`. A Space's
// "pipeline" is a sales funnel for a business, a client journey for a practitioner / coach, and a
// supporter lifecycle for an organization.
//
// SHAPE: this module is PURE (no Supabase / Next imports), so defaultStagesForSpaceType is trivially
// unit-testable. The IO seam that actually seeds crm_stages for a Space (ensureSpaceStages) lives in
// lib/crm/pipeline.ts, which imports these templates. No member-facing copy here is a feature name;
// the stage labels are operator-facing pipeline columns, plain and per CONTENT-VOICE (no em/en dashes).

import type { SpaceType } from '@/lib/spaces/types'
import type { StageKind } from './pipeline'

/** One seed stage in a template: a label, its order, and its kind (open / won / lost), which drives
 *  the deal status + the column tone. The first 'open' stage is where a graduated contact's deal
 *  lands. */
export interface StageTemplate {
  name: string
  kind: StageKind
}

// The generic fallback for any Space type without a bespoke template (event_space / lab / partner /
// root and anything new): a plain, sensible open->won/lost funnel so every Space gets a working board.
const GENERIC: StageTemplate[] = [
  { name: 'New', kind: 'open' },
  { name: 'Active', kind: 'open' },
  { name: 'Won', kind: 'won' },
  { name: 'Lost', kind: 'lost' },
]

// Business = a sales funnel (CRM-STRATEGY §7).
const BUSINESS: StageTemplate[] = [
  { name: 'Lead', kind: 'open' },
  { name: 'Contacted', kind: 'open' },
  { name: 'Qualified', kind: 'open' },
  { name: 'Proposal', kind: 'open' },
  { name: 'Won', kind: 'won' },
  { name: 'Lost', kind: 'lost' },
]

// Practitioner (and Coaching) = a client journey (CRM-STRATEGY §7). 'Rebook' is the won outcome (the
// relationship continues); 'Lapsed' is the lost outcome (it went quiet).
const CLIENT_JOURNEY: StageTemplate[] = [
  { name: 'Inquiry', kind: 'open' },
  { name: 'Intake', kind: 'open' },
  { name: 'Active', kind: 'open' },
  { name: 'Lapsed', kind: 'lost' },
  { name: 'Rebook', kind: 'won' },
]

// Organization / nonprofit = a supporter lifecycle (CRM-STRATEGY §7). 'Recurring' + 'Reactivated' are
// the won outcomes (giving is live); 'Lapsed' is the lost outcome.
const SUPPORTER_LIFECYCLE: StageTemplate[] = [
  { name: 'Prospect', kind: 'open' },
  { name: 'First gift', kind: 'open' },
  { name: 'Recurring', kind: 'won' },
  { name: 'Lapsed', kind: 'lost' },
  { name: 'Reactivated', kind: 'won' },
]

/** The seed stage template for a Space type. PURE + total: every SpaceType resolves (the bespoke
 *  segments map to their funnel; everything else falls to a sensible generic), so a caller always
 *  gets a non-empty, ordered set of stages. The returned array is fresh each call (callers may
 *  number it), with sort order = array index. */
export function defaultStagesForSpaceType(type: SpaceType | null | undefined): StageTemplate[] {
  switch (type) {
    case 'business':
      return [...BUSINESS]
    case 'practitioner':
    case 'coaching':
      return [...CLIENT_JOURNEY]
    case 'organization':
      return [...SUPPORTER_LIFECYCLE]
    default:
      // root / event_space / lab / partner / null / unknown -> the generic funnel.
      return [...GENERIC]
  }
}
