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
- `DataTable<T>` + `ColumnDef<T>`, `BulkAction`. Typed columns, row-as-link, hover `rowActions`, checkbox `selectable` + promoted/overflow `bulkActions`, `stickyHeader`, `density`, `caption`, `empty`. Sort writes `?sort&dir` to the URL (server owns data). Pass rows already sorted/filtered/paged by the server.
- `TableSkeleton` — `@/components/admin/table-skeleton`. Suspense fallback (`rows`,`cols`).

## Entity detail — Detail template
- `EntityHeader` — `@/components/admin/entity-header`. Context band: `{ title, eyebrow?, avatar?, badges?, facts?, actions?, back? }` (facts = description list).
- `UnderlineTabs` — `@/components/admin/underline-tabs`. `{ tabs:{href,label,count?}[] }`; each tab a URL segment.

## Forms & settings
- `FormSection` — `@/components/admin/form-section`. Annotated group `{ title, description, children }` (Settings template).

## Destructive & async
- `DangerModal` — `@/components/admin/danger-modal`. `{ open, onClose, title, body, confirmLabel, onConfirm, requireTyping? }`. Named button, safe default, never Enter-to-destroy. Risky-recoverable tier.
- `useUndoToast()` → `{ show, dismiss, toast }` — `@/components/admin/undo-toast`. Reversible tier: act optimistically, then `show(msg, undo)`; render `{toast}`.

## Attention & trust
- `AttentionList` + `AttentionItem` — `@/components/admin/attention-list`. Ranked needs-attention spine; each item one click from its action.
- `FreshnessNote` — `@/components/admin/freshness-note`. `{ at, sla?, label? }` → "Updated {relative}"; warns past SLA.

## States & empties — `@/components/ui/empty-state`
- `EmptyState` — `{ title, description?, action?, icon?, variant:'first-use'|'no-results'|'cleared'|'error'|'permission' }`. Never a blank pane.
