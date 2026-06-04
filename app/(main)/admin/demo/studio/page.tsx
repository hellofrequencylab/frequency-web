import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { Sparkles } from 'lucide-react'
import { StudioWizard } from './studio-wizard'

// Janitor-only: the Seed Studio — generate a believable demo community for any
// new area on demand (docs/DEMO-SYSTEM.md, ADR-091). Everything it creates is
// is_demo, area-scoped, previewable, and reversible.
export default async function SeedStudioPage() {
  await requireAdmin('janitor')
  const admin = createAdminClient()
  const { data } = await admin
    .from('topical_channels')
    .select('slug, name')
    .eq('is_active', true)
    .order('display_order')
  const channels = (data ?? []).map((c) => ({ slug: c.slug as string, name: c.name as string }))

  return (
    <AdminPage
      title="Seed Studio"
      eyebrow="Demo content"
      icon={Sparkles}
      description="Spin up a believable, year-old-feeling community for a new area: circles, people with real journeys, conversations between them, events, and gamification. Everything is tagged demo, previewable before it writes, and reversible by area."
      width="default"
    >
      <StudioWizard channels={channels} />
    </AdminPage>
  )
}
