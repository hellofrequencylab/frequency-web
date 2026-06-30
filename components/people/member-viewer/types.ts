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
  SortSpec,
  MemberQuery,
} from '@/lib/people/member-viewer'

import type { Facet, MemberSummary, MemberDetail, SortSpec, MemberQuery } from '@/lib/people/member-viewer'

/** How the right pane reads. `full` = the rich detail card (contact, activity, stats, actions);
 *  `quick-stats` = a compact stat grid topped by a prominent Open Profile button. Default `full`. */
export type DetailMode = 'full' | 'quick-stats'

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
  /** Initial list presentation; a visible toggle flips it. Default `list`. */
  defaultView?: ListView
  /** Rows per page (clamped 10..20). Default 15. */
  pageSize?: number
  /** The search bar config. Omit to hide search entirely. */
  search?: { placeholder?: string; facets?: Facet[] }
  /** The active/initial sort. */
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
}
