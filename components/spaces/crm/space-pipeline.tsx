import { Briefcase } from 'lucide-react'
import { getDeals, getStages, formatMoney, type CrmDeal, type CrmStage } from '@/lib/crm/pipeline'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StageEditor } from './stage-editor'

// PER-SPACE PIPELINE (ENTITY-SPACES-BUILD Phase 2; stages made EDITABLE by ADR-517 Phase F2). A self-
// fetching server component that renders THIS Space's deals grouped by stage, scoped by space_id.
//
// EDITABLE STAGES (F2): when `editable` + `slug` are passed (the board's Pipeline view, for a manager),
// an owner-only "Edit stages" control mounts above the columns — add / rename / set kind / reorder /
// delete, each persisted through the owner-gated, space-scoped server actions (lib/crm/stages.ts). The
// read-only column render stays for a non-manager and for the lighter Focus CRM surface (no `editable`).
// Composes kit primitives only (SectionHeader, EmptyState). No em/en dashes (CONTENT-VOICE §10).

function stageDotClass(kind: CrmStage['kind']): string {
  return kind === 'won' ? 'bg-success' : kind === 'lost' ? 'bg-danger' : 'bg-primary'
}

export async function SpacePipeline({
  spaceId,
  slug,
  editable = false,
}: {
  spaceId: string
  /** The Space slug — required to mount the editor (the stage actions re-resolve + re-gate by slug). */
  slug?: string
  /** Mount the owner-only "Edit stages" control (a manager on the board's Pipeline view). */
  editable?: boolean
}) {
  const [stages, deals] = await Promise.all([getStages(spaceId), getDeals(spaceId)])

  const showEditor = editable && !!slug && stages.length > 0
  const dealCounts: Record<string, number> = {}
  for (const d of deals) if (d.stage_id) dealCounts[d.stage_id] = (dealCounts[d.stage_id] ?? 0) + 1

  // Nothing to show and nothing to edit: the calm empty state (a manager with stages still gets the
  // editor below, so this only fires for an un-seeded / read-only surface with no deals).
  if (deals.length === 0 && !showEditor) {
    return (
      <section>
        <SectionHeader title="Pipeline" />
        <EmptyState
          icon={Briefcase}
          title="No deals yet."
          description="Deals you track for this space show here, grouped by stage."
        />
      </section>
    )
  }

  const byStage = (id: string): CrmDeal[] => deals.filter((d) => d.stage_id === id)
  const stageValue = (id: string): number => byStage(id).reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <section>
      <SectionHeader title="Pipeline" count={deals.length} />

      {showEditor && (
        <div className="mb-3">
          <StageEditor
            slug={slug!}
            stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, sort_order: s.sort_order }))}
            dealCounts={dealCounts}
          />
        </div>
      )}

      {deals.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No deals yet."
          description="Deals you track for this space show here, grouped by the stages above."
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const items = byStage(stage.id)
            return (
              <div
                key={stage.id}
                className="w-64 shrink-0 rounded-2xl border border-border bg-surface-elevated/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${stageDotClass(stage.kind)}`} />
                    <p className="truncate text-sm font-semibold text-text">{stage.name}</p>
                    <span className="shrink-0 text-xs tabular-nums text-subtle">{items.length}</span>
                  </div>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                    {formatMoney(stageValue(stage.id))}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((deal) => {
                    const who = deal.member?.display_name ?? deal.contact_name
                    return (
                      <div
                        key={deal.id}
                        className="rounded-xl border border-border bg-surface p-3 shadow-sm"
                      >
                        <p className="line-clamp-2 text-sm font-semibold text-text">{deal.title}</p>
                        {who && <p className="mt-0.5 truncate text-xs text-muted">{who}</p>}
                        <p className="mt-2 text-sm font-bold tabular-nums text-text">
                          {formatMoney(deal.value, deal.currency)}
                        </p>
                      </div>
                    )
                  })}
                  {items.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
                      No deals
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
