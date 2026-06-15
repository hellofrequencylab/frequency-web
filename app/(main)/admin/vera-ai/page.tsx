import { Bot } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { getCapabilityOverrides } from '@/lib/permissions'
import { isStaff, isJanitor } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { RelatedAreas } from '@/components/admin/related-areas'
import { VeraTab } from '@/components/admin/vera-ai/vera-tab'
import { HelpGapsTab } from '@/components/admin/vera-ai/help-gaps-tab'
import { AiControlsTab } from '@/components/admin/vera-ai/ai-controls-tab'
import { StudioTab } from '@/components/admin/vera-ai/studio-tab'

// The consolidated VERA & AI workspace (ADR-265): one tabbed surface that absorbed the
// four sub-pages — Vera config, Help gaps, AI controls, and the AI Studio — so the
// assistant + the intelligence behind it live in one place. Tabs are query-param views
// (the UnderlineTabs pattern). Unlike Insights/Growth, these four kept DIVERGENT gates,
// so tabs are gated PER TAB: a viewer sees only the tabs they may use, the default is the
// first allowed, and an unknown/forbidden ?tab coerces to it. Each tab also re-asserts its
// own gate. The separate Insights suite stays its own workspace (a group cross-link).
export const dynamic = 'force-dynamic'

const TAB_KEYS = ['vera', 'help-gaps', 'ai', 'studio'] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABEL: Record<TabKey, string> = {
  vera: 'Vera',
  'help-gaps': 'Help gaps',
  ai: 'AI controls',
  studio: 'Studio',
}

export default async function VeraAiWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const profile = await getCallerProfile()
  if (!profile) redirect('/')
  const staff = await getStaffMember().catch(() => null)
  const staffRole = staff?.role ?? null
  const overrides = await getCapabilityOverrides().catch(() => undefined)
  const webRole = profile.webRole

  // Per-tab access, mirroring each former page's guard exactly:
  //   vera  → requireAdmin('janitor', { staff: 'insights' })
  //   ai    → requireAdmin('janitor', { staff: 'platform' })
  //   help-gaps → requireAdmin('janitor')        (janitor only)
  //   studio    → requireAdmin('admin')          (any staff web_role)
  const can: Record<TabKey, boolean> = {
    vera: isJanitor(webRole) || staffCan(staffRole, 'insights', 'write', overrides),
    'help-gaps': isJanitor(webRole),
    ai: isJanitor(webRole) || staffCan(staffRole, 'platform', 'write', overrides),
    studio: isStaff(webRole),
  }
  const allowed = TAB_KEYS.filter((k) => can[k])
  if (allowed.length === 0) redirect('/feed')

  const { tab: raw } = await searchParams
  const tab: TabKey = allowed.includes(raw as TabKey) ? (raw as TabKey) : allowed[0]
  const href = (t: TabKey) => `/admin/vera-ai?tab=${t}`

  return (
    <AdminTemplate
      title="Vera AI"
      eyebrow="Domain"
      icon={Bot}
      width="wide"
      description="The assistant and the intelligence behind it: Vera's voice, the help gaps she surfaces, the platform AI controls, and the recommendations she generates."
    >
      <AdminSection>
        <UnderlineTabs
          activeHref={href(tab)}
          tabs={allowed.map((t) => ({ href: href(t), label: TAB_LABEL[t] }))}
        />
      </AdminSection>

      <div className="mt-2">
        {tab === 'vera' && <VeraTab />}
        {tab === 'help-gaps' && <HelpGapsTab />}
        {tab === 'ai' && <AiControlsTab />}
        {tab === 'studio' && <StudioTab />}
      </div>

      <RelatedAreas current="vera-ai" role={profile.community_role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}
