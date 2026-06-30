import { listRules, AUTOMATION_TRIGGERS } from '@/lib/automations'
import { RuleForm } from './rule-form'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { AutomationsTable } from './automations-table'

export const dynamic = 'force-dynamic'

export default async function AutomationsPage() {
  const rules = await listRules()

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Automations"
      description="Rules that watch the event backbone and act. When a member triggers an event (a verified practice, a check-in, a join), the rule checks its conditions, then runs through the spine (queued, consent-checked). This is what the AI operator will later drive."
      width="wide"
    >
      <AdminSection title="New rule">
        <RuleForm triggers={AUTOMATION_TRIGGERS} />
      </AdminSection>

      <AdminSection title="Rules" description={`${rules.length} rule${rules.length === 1 ? '' : 's'}.`}>
        {rules.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="No automations yet."
            description="Add a rule above to react to events on the backbone."
          />
        ) : (
          <AutomationsTable rules={rules} triggers={AUTOMATION_TRIGGERS} />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
