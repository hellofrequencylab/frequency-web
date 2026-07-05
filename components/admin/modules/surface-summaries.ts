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
  /** The read-gated getter — returns `{ count }` (plus, for a metered surface, the Space's current plan
   *  `tier` for the usage meter) for a manager who can use the tool, else null (fail-safe → the card
   *  degrades to a plain link-row). */
  getter: (slug: string) => Promise<{ count: number; tier?: string } | null>
  /** The glanceable stat copy for a resolved count (correct singular/plural, no em dashes). */
  format: (n: { count: number }) => string
  /** OPTIONAL feature-meter key (ADR-520 P2, lib/pricing/feature-meters.ts). When set AND the getter
   *  returns a `tier`, the card renders a thin inline usage line (count against the tier's allowance) with
   *  a quiet fill bar and an "Upgrade" nudge once usage crosses USAGE_UPGRADE_THRESHOLD. Informs, never
   *  blocks. The count is the live proxy for the metered dimension (e.g. CRM deals for contacts). */
  meterKey?: string
}

export const SURFACE_SUMMARIES: Record<string, SurfaceSummaryEntry> = {
  'space.people': {
    getter: getSpaceMembersSummary,
    format: (n) => (n.count === 1 ? '1 member' : `${n.count} members`),
  },
  'space.engage.crm': {
    getter: getSpaceCrmSummary,
    format: (n) => (n.count === 1 ? '1 in your pipeline' : `${n.count} in your pipeline`),
    // The CRM contacts meter (ADR-519). CRM stays an inline card in the Audience group (ADR-520) so this
    // usage line is visible in the rail body. The pipeline count is the live proxy for contacts.
    meterKey: 'space_crm',
  },
  'space.services': {
    getter: getSpaceServicesSummary,
    // Store (modular menu P1b, ADR-544b): the storefront lists items, so the glanceable stat counts items.
    format: (n) => (n.count === 1 ? '1 item listed' : `${n.count} items listed`),
  },
  'space.comms': {
    getter: getSpaceCampaignsSummary,
    format: (n) => (n.count === 1 ? '1 campaign' : `${n.count} campaigns`),
    // The Email sends meter (ADR-519). Email is banked in the Reach group (ADR-520), so this line shows
    // only if Email is ever surfaced as a body card; its ladder also lives in the Plan and usage hub.
    meterKey: 'space_email',
  },
}
