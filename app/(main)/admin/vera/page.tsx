import Link from 'next/link'
import { Bot, ArrowRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { getVeraAdminData } from './load-vera'
import { VeraConfigForm } from './vera-config-form'

// Tune Vera — her style + live responses + the induction/funnel copy, no deploy
// needed (AI-VERA.md). Writes vera_config; read live by the loop + induction.
// This is also the AI control room: the operator Agent (which proposes actions for
// approval) lives here now, lifted out of the deep Marketing menu (IA restructure).
// The SETTINGS template (ADR-233 §3.8): annotated FormSections; the declarative config
// fields explicit-save (one Save Vera button), the splash feed has its own imperative
// refresh/veto controls. Gate (PB.1h): community janitor OR a staff role with the
// `insights` domain (write).
export const dynamic = 'force-dynamic'

export default async function VeraAdminPage() {
  await requireAdmin('janitor', { staff: 'insights' })
  const { cfg, featured } = await getVeraAdminData()

  return (
    <AdminTemplate
      title="Manage Vera"
      eyebrow="Vera"
      icon={Bot}
      description="Tune Vera's voice, her live responses, and the founder-induction copy. Saved instantly, no deploy."
    >
      <AdminSection title="AI operator" description="The console where the operator proposes work for your approval.">
        <Link
          href="/admin/marketing/agent"
          className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-broadcast hover:bg-broadcast-bg/20 motion-reduce:transition-none"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold text-text">
              Agent console
              <ArrowRight className="h-3.5 w-3.5 text-subtle transition-colors group-hover:text-broadcast-strong" aria-hidden />
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              The operator proposes winbacks and content drafts; you approve. Every action runs through
              the consent/suppression spine.
            </span>
          </span>
        </Link>
      </AdminSection>

      <AdminSection title="Voice and copy" description="Vera's voice, her live responses, and the founder-induction flow.">
        <VeraConfigForm cfg={cfg} featured={featured} />
      </AdminSection>
    </AdminTemplate>
  )
}
