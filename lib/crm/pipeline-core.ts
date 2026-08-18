// THE CRM PIPELINE SHAPES — the row types and the money formatter, with no imports (LIVE-037).
//
// WHY THIS FILE EXISTS. All of this lived in `lib/crm/pipeline.ts`, whose first line is
// `createAdminClient` from lib/supabase/admin, and from there @supabase/supabase-js and a
// crypto-browserify polyfill graph. `app/(main)/admin/crm/pipeline-board.tsx` and
// `app/(main)/admin/crm/pipeline/[id]/deal-detail.tsx` are both `'use client'` and imported ONE
// pure function from it — `formatMoney`, an `Intl.NumberFormat` wrapper — so that whole server graph
// was in the Pipeline board's and the deal detail's browser bundles, and `import 'server-only'`
// could not be added to `lib/crm/pipeline.ts` without failing the build.
//
// Same shape of fix, same reasoning, as `lib/journeys/meeting.ts` and `lib/pillars/slugs.ts`
// (ADR-1074): a formatter and a handful of row shapes parked in a file whose other exports reach the
// database. A bundler follows modules, not intentions.
//
// ⚠️ KEEP THIS FILE DEPENDENCY-FREE. An import here re-opens the door it was written to close.
// `lib/crm/pipeline.ts` re-exports every name below, so every existing server caller — and every
// `import type` — is unchanged; CLIENT code must import from here.
//
// The crm_* tables are not in the generated DB types yet (ADR-246), so these hand-written shapes are
// what the read layer hydrates into and what every surface renders from.

/** A stage's disposition: still in play, closed won, or closed lost. */
export type StageKind = 'open' | 'won' | 'lost'

/** One column on a pipeline board. */
export type CrmStage = { id: string; name: string; sort_order: number; kind: StageKind }

/** The minimal person shape a deal / activity resolves its owner, member, or author into. */
export type PersonLite = { id: string; display_name: string; handle: string | null; avatar_url: string | null }

/** One deal, with its owner + member already resolved. */
export type CrmDeal = {
  id: string
  title: string
  contact_name: string | null
  contact_id: string | null
  profile_id: string | null
  stage_id: string | null
  value: number
  currency: string
  status: StageKind
  source: string | null
  expected_close_date: string | null
  owner_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  owner: PersonLite | null
  member: PersonLite | null
}

/** One activity on a deal: a note, a logged touch, or a task (kind='task'). */
export type CrmActivity = {
  id: string
  deal_id: string | null
  kind: 'note' | 'call' | 'email' | 'meeting' | 'task'
  body: string
  due_at: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  author: PersonLite | null
}

/** One contact in a Space's CRM lane. */
export type CrmContact = {
  id: string
  email: string
  display_name: string | null
  consent_state: string
  created_at: string | null
  /** Imported custom fields, keyed by their stable registry key -> value (from `contacts.meta.custom`).
   *  Only populated by the single-contact `getContact` read; the list read leaves it undefined. */
  custom?: Record<string, string>
}

/** One task: a crm_activities row with kind='task', labeled with what it points at. */
export type SpaceTask = {
  id: string
  title: string
  due_at: string | null
  completed_at: string | null
  deal_id: string | null
  contact_id: string | null
  created_at: string
  /** A short label for what the task points at (deal title or contact name), resolved at read time. */
  linkLabel: string | null
}

// ── Presentation helpers ──────────────────────────────────────────────────────

/** Whole-dollar currency for a deal value. Takes DOLLARS, not cents (see the note in
 *  lib/commerce/types.ts). Pure: an Intl call and nothing else. */
export function formatMoney(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0)
}
