// The guided setup front door (EMAIL-CAMPAIGNS-FUNNELS-PLAN P3, ask #3/#6). "New"
// opens a three-screen flow: pick a goal, answer a few questions, then let Vera draft
// it or build it manually, seeded from a best-practice template. Composes the kit
// (AdminTemplate + the WizardProgress-driven client). Gate re-checked here and in the
// build action.

import { Sparkles } from 'lucide-react'
import { AdminTemplate } from '@/components/templates'
import { requireAdmin } from '@/lib/admin/guard'
import { listSegmentOptions } from '@/lib/studio/campaigns'
import { GuidedSetup } from './guided-client'

export const dynamic = 'force-dynamic'

export default async function NewMessagePage() {
  await requireAdmin('admin', { staff: 'marketing' })
  const segments = await listSegmentOptions()

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="New message"
      icon={Sparkles}
      back={{ href: '/admin/marketing/messaging', label: 'Messaging' }}
      description="Start from a goal, not a blank page. Answer a few questions, then let Vera draft it or build it by hand."
    >
      <GuidedSetup segments={segments} />
    </AdminTemplate>
  )
}
