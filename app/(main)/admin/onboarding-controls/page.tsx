import { ToggleRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { getOnboardingControlsData } from './load'
import { OnboardingControlsView } from './onboarding-controls-view'

export const dynamic = 'force-dynamic'

// Operator switches for the activation chrome (Next Steps prompts, auto-launching
// popups) and the referral program. Each is a platform_flags row, audited in
// platform_flag_events. Janitor-gated, matching this page's entry in
// app/(main)/admin/sections.ts. The referral REWARD amount is edited in Rewards
// (/admin/gamification, zap_config) — surfaced read-only here.
export default async function OnboardingControlsPage() {
  await requireAdmin('janitor')
  const data = await getOnboardingControlsData()

  return (
    <AdminTemplate
      title="Onboarding & referral controls"
      icon={ToggleRight}
      eyebrow="Acquisition"
      description="Turn the activation chrome and the referral program on or off. Every switch is reversible and logged. The referral reward amount lives in Rewards."
    >
      <OnboardingControlsView data={data} />
    </AdminTemplate>
  )
}
