import Link from 'next/link'
import { Bot, ArrowRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminSection } from '@/components/templates'
import { getVeraAdminData } from '@/app/(main)/admin/vera/load-vera'
import { VeraConfigForm } from '@/app/(main)/admin/vera/vera-config-form'

// The "Vera" tab of the consolidated Vera & AI workspace (ADR-265) — formerly /admin/vera.
// Tune Vera's voice + live responses + induction copy (AI-VERA.md); the shared
// VeraConfigForm + loader + saveVera action are reused unchanged. Gate: janitor OR
// insights staff (write) — re-asserted here (the workspace only renders it when allowed).
export async function VeraTab() {
  await requireAdmin('janitor', { staff: 'insights' })
  const { cfg, featured } = await getVeraAdminData()

  return (
    <>
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
    </>
  )
}
