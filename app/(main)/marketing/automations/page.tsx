import { listRules, AUTOMATION_TRIGGERS } from '@/lib/automations'
import { RuleForm } from './rule-form'
import { toggleRule } from './actions'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

export default async function AutomationsPage() {
  const rules = await listRules()

  return (
    <DashboardTemplate
      eyebrow="Marketing"
      title="Automations"
      description="Rules that watch the event backbone and act. When a member triggers an event (a verified practice, a check-in, a join), the rule runs through the spine (queued, consent-checked). This is what the AI operator will later drive."
    >
      <RuleForm triggers={AUTOMATION_TRIGGERS} />

      <section>
        <SectionHeader title="Rules" count={rules.length} />
        {rules.length === 0 ? (
          <EmptyState
            title="No automations yet."
            description="Add a rule above to react to events on the backbone."
          />
        ) : (
          <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/60 max-w-2xl">
              {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{r.name}</p>
                  <p className="text-xs text-subtle">
                    on <code className="text-text">{r.triggerEvent}</code> · email member
                  </p>
                </div>
                <form action={toggleRule.bind(null, r.id, !r.enabled)}>
                  <button
                    type="submit"
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      r.enabled
                        ? 'bg-success-bg text-success hover:bg-surface-elevated'
                        : 'bg-surface-elevated text-muted hover:bg-primary-bg hover:text-primary-strong'
                    }`}
                  >
                    {r.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardTemplate>
  )
}
