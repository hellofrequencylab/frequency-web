import { CheckCircle2, CircleDashed, ShieldCheck, XCircle } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { newWorldConformance, type ConformanceRow } from '@/lib/theme/new-world-conformance'

export const dynamic = 'force-dynamic'

// NEW WORLD CONFORMANCE (LIVE-2205; the handoff's reference/Conformance.html). Staff only. Runs the ten theme invariants
// against New World's real code on every load (lib/theme/new-world-conformance.ts) and lists each as Pass, Fail or Skipped,
// with the reason a check could not run here. Nothing on this page is a Space website, so no site theme CSS reaches it.

const RESULT: Record<ConformanceRow['result'], { label: string; tone: BadgeTone }> = {
  pass: { label: 'Pass', tone: 'success' },
  fail: { label: 'Fail', tone: 'danger' },
  skip: { label: 'Skipped', tone: 'neutral' },
  ruled: { label: 'Owner rule', tone: 'warning' },
}

export default async function NewWorldConformancePage() {
  await requireAdmin('janitor')
  const rows = newWorldConformance()
  const count = (r: ConformanceRow['result']) => rows.filter((x) => x.result === r).length

  return (
    <AdminTemplate
      icon={ShieldCheck}
      eyebrow="Theme Studio"
      title="New World checks"
      description="The ten rules every theme has to hold before an owner gets its settings, run live against New World's code each time this page loads."
    >
      <AdminSection>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Pass" value={count('pass')} icon={CheckCircle2} detail={count('ruled') ? `Plus ${count('ruled')} held to an owner rule instead` : undefined} />
          <StatCard label="Fail" value={count('fail')} icon={XCircle} />
          <StatCard label="Skipped" value={count('skip')} icon={CircleDashed} detail="Need a browser or a setting New World does not ship yet" />
        </div>
      </AdminSection>
      <AdminSection title="Every rule" description="Contrast covers all five accents on Night and Day. The function and parity checks cover all seven starter kits.">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
              <span className="sm:w-24 sm:shrink-0">
                <Badge tone={RESULT[r.result].tone}>{RESULT[r.result].label}</Badge>
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-text">{r.name}</span>
                <span className="block text-body-sm text-muted">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </AdminSection>
    </AdminTemplate>
  )
}
