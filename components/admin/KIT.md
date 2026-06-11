# Admin kit

The shared operator components (ADR-233, spec: `docs/ADMIN-DESIGN-SYSTEM.md`). Compose
these — never hand-roll a table, status pill, form group, or modal. Semantic tokens
only; warm type; tabular numerals; AA.

## Layout & dashboard (existing)
- `AdminTemplate`, `AdminSection` — `@/components/templates/admin-template`. Page shell.
- `DashArea`, `TileGrid`, `Tile`, `GraphTile`, `MiniStat`, `MiniGrid`, `SeverityChip` — `@/components/admin/dash`. The tiled dashboard grammar (canvas headers + white tiles).
- `StatCard` — `@/components/ui/stat-card`. KPI tile: `label, value, icon?, delta?, detail?, href?, bordered?, size?, sparkline?`.
- `TrendArea`, `WeekBars`, `RingGauge`, `weeklyBuckets`, `cumulative` — `@/components/admin/spark-charts`.

## Status & feedback — `@/components/admin/status`
- `StatusChip` — `{ tone:'success'|'warning'|'danger'|'info'|'neutral', size? }`. The ONE status vocabulary (retire per-page `*_STYLES`/`STATUS_STYLE`/`ACTION_LABEL` dicts).
- `Badge` — count pill. `DeltaBadge` — `{ delta:'increase'|'moderateIncrease'|'unchanged'|'moderateDecrease'|'decrease' }`.
- `Banner` — `{ tone:'info'|'warning'|'critical', title, action?, dismissible? }`; `critical` ⇒ `role="alert"`.

## Tables — `@/components/admin/data-table`
- `DataTable<T>` + `ColumnDef<T>`, `BulkAction`. Typed columns, row-as-link (`rowHref` — omit for a static browse table), hover `rowActions`, checkbox `selectable` + promoted/overflow `bulkActions`, `stickyHeader`, `density`, `caption`, `empty`, and `expandedRowId`+`expandedRow(row)` for an inline-edit/detail panel beneath a row. Sort writes `?sort&dir` to the URL (server owns data). Pass rows already sorted/filtered/paged by the server.
- `FilterBar` — `@/components/admin/filter-bar`. URL-as-state `{ filters:FilterDef[], search? }` (selects + search + removable chips) above a DataTable.
- `TableSkeleton` — `@/components/admin/table-skeleton`. Suspense fallback (`rows`,`cols`).
- `RankList` — `@/components/admin/rank-list`. Ranked value→count micro-list (`items:{value,n,href?}[]`) for a `Tile` (top pages/features/channels).

## Entity detail — Detail template
- `EntityHeader` — `@/components/admin/entity-header`. Context band: `{ title, eyebrow?, avatar?, badges?, facts?, actions?, back? }` (facts = description list).
- `UnderlineTabs` — `@/components/admin/underline-tabs`. `{ tabs:{href,label,count?}[] }`; each tab a URL segment.

## Forms & settings
- `FormSection` — `@/components/admin/form-section`. Annotated group `{ title, description, children }` (Settings template).
- `Toggle` — `@/components/admin/toggle`. Accessible `role="switch"` `{ checked, onChange, ariaLabel, saveState? }` with a built-in Saving…/Saved cue (imperative settings autosave).
- Styled link-button: use the existing `Button` with `asChild` (`<Button asChild><Link …/></Button>`) or `buttonClasses(variant,size)` from `@/components/ui/button` — do NOT hand-roll `bg-primary…` on a `<Link>`.

## Entity-detail tabs note
- `UnderlineTabs` takes an optional `activeHref` to drive the active tab for query-param views (`?view=`), where pathname matching can't disambiguate.

## Destructive & async
- `DangerModal` — `@/components/admin/danger-modal`. `{ open, onClose, title, body, confirmLabel, onConfirm, requireTyping? }`. Named button, safe default, never Enter-to-destroy. Risky-recoverable tier.
- `useUndoToast()` → `{ show, dismiss, toast }` — `@/components/admin/undo-toast`. Reversible tier: act optimistically, then `show(msg, undo)`; render `{toast}`.

## Attention & trust
- `AttentionList` + `AttentionItem` — `@/components/admin/attention-list`. Ranked needs-attention spine; each item one click from its action.
- `FreshnessNote` — `@/components/admin/freshness-note`. `{ at, sla?, label? }` → "Updated {relative}"; warns past SLA.

## States & empties — `@/components/ui/empty-state`
- `EmptyState` — `{ title, description?, action?, icon?, variant:'first-use'|'no-results'|'cleared'|'error'|'permission' }`. Never a blank pane.
