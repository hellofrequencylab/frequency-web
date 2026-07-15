// The member-viewer block: a reusable, reconfigurable master-detail member browser
// (list left, member viewer right). Compose it on any surface that browses members.
// The PURE list logic + the data contract live in lib/people/member-viewer (unit-tested);
// these components are the presentation. See docs/DECISIONS.md ADR-459.

export { MemberViewer } from './member-viewer'
export { MemberDetailCard } from './member-detail-card'
export { CrmMemberDetailPane } from './crm-member-detail'
export type {
  MemberViewerProps,
  DetailMode,
  DetailVariant,
  CrmMemberDetail,
  CrmScores,
  CrmEngagement,
  ListView,
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
} from './types'
