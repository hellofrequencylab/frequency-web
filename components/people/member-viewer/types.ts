// The presentation-neutral contract for the member-viewer block (ADR-017 / ADR-018:
// a component takes data + intent, never reaches for IO). Every type is re-exported
// from the PURE core (lib/people/member-viewer) so the components, the host wiring,
// and the unit tests all speak one vocabulary. Import types from here; import logic
// (applyQuery, etc.) from the lib module.

export type {
  Facet,
  MemberSummary,
  MemberDetail,
  MemberAction,
  MemberRole,
  MemberFunnel,
  MemberPipeline,
  MemberInteraction,
  SortSpec,
  SortOption,
  MemberQuery,
} from '@/lib/people/member-viewer'

import type {
  Facet,
  MemberSummary,
  MemberDetail,
  SortSpec,
  SortOption,
  MemberQuery,
} from '@/lib/people/member-viewer'
import type { MemberNetwork, Milestone } from '@/lib/crm/member-network'

/** How the right pane reads. `full` = the rich detail card (contact, activity, stats, actions);
 *  `quick-stats` = a compact stat grid topped by a prominent Open Profile button. Default `full`. */
export type DetailMode = 'full' | 'quick-stats'

/** Which right-pane component renders. `card` = the generic MemberDetailCard (browse surfaces);
 *  `crm` = the CRM master-detail pane (a compact profile + the composer + an expandable full profile
 *  ported from the retired contact page). Default `card`. */
export type DetailVariant = 'card' | 'crm'

// ── The CRM master-detail extension (Resonance CRM home · ADR-459) ─────────────
// The cockpit's right pane needs everything about a member on ONE page. `loadMemberDetail` returns a
// CrmMemberDetail (a MemberDetail plus the extra rich fields below, all optional + fail-safe), and the
// CRM pane renders them inline. Every field is optional so the pane renders only what was sourced.

/** The member's shared scores, pre-labeled for the pane (no re-derivation client-side). */
export interface CrmScores {
  health: number | null
  /** The Resonance tier, already labeled (e.g. "Resonant"). */
  tier: string | null
  /** The churn risk, already labeled (e.g. "Low"). */
  churn: string | null
  activation: number | null
  /** The lifecycle stage, already labeled (e.g. "Engaged"). */
  lifecycle: string | null
}

/** The per-member engagement rollup (the 4-across tiles): reached vs. responded. */
export interface CrmEngagement {
  sent: number
  opened: number
  clicked: number
  replied: number
  /** A short "last touch" date, already formatted, or null when there is none. */
  lastTouch: string | null
}

/** The rich fields the CRM master-detail pane adds on top of a MemberDetail. */
export interface CrmMemberDetail extends MemberDetail {
  /** The member's profile id (the composer + the network reader key). */
  profileId: string
  /** The stitched CRM email (the composer + engagement subject). */
  email?: string | null
  scores?: CrmScores
  engagement?: CrmEngagement
  /** What they manage + what they are part of. */
  network?: MemberNetwork
  /** The "Path" rail: MAJOR milestones only, newest first. */
  milestones?: Milestone[]
  /** Steward notes captured about this person. */
  notes?: { id: string; body: string }[]
}

/** The initial list presentation, with a visible toggle. `card` = PersonCard tiles in a grid;
 *  `list` = compact rows. Default `list`. */
export type ListView = 'list' | 'card'

/** The block's full prop surface. All optional but `members`; a host wires only what it needs. */
export interface MemberViewerProps {
  members: MemberSummary[]
  /** Lazy-load the right pane for a row (skeleton while pending, fail-safe to a calm note on
   *  reject). Omit when every row already carries an embedded `detail`. */
  loadDetail?: (id: string) => Promise<MemberDetail>
  /** Right-pane mode. Default `full`. */
  detailMode?: DetailMode
  /** Which right-pane component renders. Default `card` (the generic detail card); `crm` renders the
   *  Resonance CRM master-detail pane (compact profile + composer + expandable full profile). */
  detailVariant?: DetailVariant
  /** Initial list presentation; a visible toggle flips it. Default `list`. */
  defaultView?: ListView
  /** The batch size for the list: how many rows show up front, and how many more each time the
   *  infinite-scroll sentinel comes into view. Default 12. */
  pageSize?: number
  /** Seed the initial selection (uncontrolled) from a deep link, e.g. `?member=<profileId>`. The row
   *  must be present in the loaded set for the pane to open. */
  initialSelectedId?: string
  /** The search bar config. Omit to hide search entirely. Search is a HERO affordance. */
  search?: { placeholder?: string; facets?: Facet[] }
  /** The hero sort selector's options (e.g. Recent / Active / Needs help / Name). Rendered as a
   *  prominent segmented control next to search. The first option is the initial sort unless `sort`
   *  is set. Omit to hide the sort control (the block still sorts via `sort` if given). */
  sortOptions?: SortOption[]
  /** The active/initial sort. When `sortOptions` is set, the option whose `spec` deep-equals this
   *  is pre-selected; otherwise this seeds the sort with no visible control. */
  sort?: SortSpec
  /** Controlled selection. Omit for uncontrolled (first row preselected on desktop). */
  selectedId?: string | null
  onSelectedChange?: (id: string | null) => void
  /** Server-driven hosts read this on every text/facet/sort change and refetch `members`. When
   *  set, the block still filters client-side over what it holds (so it stays responsive); a host
   *  that returns a pre-narrowed list simply gets a no-op extra filter. */
  onQueryChange?: (query: MemberQuery) => void
  /** Override the no-results / empty pane. */
  emptyState?: React.ReactNode
  /** Re-scope the CRM pane's "Message Member" composer to a Space (detailVariant `crm` only). When set, the
   *  composer sends via the SPACE email path and searches only that Space's contacts, with no crossover to
   *  the platform CRM. Omit (default) = the unchanged platform composer. */
  messageScope?: { spaceId: string; slug: string }
}
