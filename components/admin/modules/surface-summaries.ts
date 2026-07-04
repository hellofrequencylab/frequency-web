import {
  getSpaceMembersSummary,
  getSpaceCrmSummary,
  getSpaceServicesSummary,
  getSpaceCampaignsSummary,
} from '@/app/(main)/spaces/[slug]/manage/rail-getters'

// SURFACE SUMMARIES — the client-boundary map for the Phase 2 "keep it in the rail" summary cards
// (ADR-514). Mirrors the render-boundary pattern of module-map.tsx: the pure registry
// (lib/admin/entities/registry.ts) stays free of React/Supabase; this map closes the loop at the client
// boundary, binding a `render: 'link'` Space surface to (a) its read-gated, fail-safe getter and (b) the
// singular/plural COPY for the glanceable inline stat. A surface appears here IFF it has one honest,
// glanceable stat — so a link surface gets a summary CARD when SURFACE_SUMMARIES[id] exists, and falls
// back to a plain SurfaceLinkRow otherwise (data-driven + fail-safe by construction). Deliberately absent:
// space.offerings (adaptive, no single honest stat) and every extra-tier surface (QR / Insights / Billing
// / Danger — Danger must never carry a stat).
//
// The COPY lives HERE, not in rail-getters (those return only data): correct singular/plural, plain
// nouns, no em dashes (docs/CONTENT-VOICE.md §10).

export interface SurfaceSummaryEntry {
  /** The read-gated getter — returns `{ count }` for a manager who can use the tool, else null (fail-safe
   *  → the card degrades to a plain link-row). */
  getter: (slug: string) => Promise<{ count: number } | null>
  /** The glanceable stat copy for a resolved count (correct singular/plural, no em dashes). */
  format: (n: { count: number }) => string
}

export const SURFACE_SUMMARIES: Record<string, SurfaceSummaryEntry> = {
  'space.people': {
    getter: getSpaceMembersSummary,
    format: (n) => (n.count === 1 ? '1 member' : `${n.count} members`),
  },
  'space.engage.crm': {
    getter: getSpaceCrmSummary,
    format: (n) => (n.count === 1 ? '1 in your pipeline' : `${n.count} in your pipeline`),
  },
  'space.services': {
    getter: getSpaceServicesSummary,
    format: (n) => (n.count === 1 ? '1 service listed' : `${n.count} services listed`),
  },
  'space.comms': {
    getter: getSpaceCampaignsSummary,
    format: (n) => (n.count === 1 ? '1 campaign' : `${n.count} campaigns`),
  },
}
