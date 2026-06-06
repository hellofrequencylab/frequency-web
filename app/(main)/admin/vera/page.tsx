import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { getVeraAdminData } from './load-vera'
import { VeraConfigForm } from './vera-config-form'

// Janitor-only: tune Vera — her style + live responses + the induction/funnel copy,
// no deploy needed (AI-VERA.md). Writes vera_config; read live by the loop + induction.
export const dynamic = 'force-dynamic'

export default async function VeraAdminPage() {
  await requireAdmin('janitor')
  const { cfg, featured } = await getVeraAdminData()

  return (
    <AdminPage
      title="Manage Vera"
      eyebrow="Vera"
      description="Tune Vera’s voice, her live responses, and the founder-induction copy — saved instantly, no deploy."
      width="narrow"
    >
      <VeraConfigForm cfg={cfg} featured={featured} />
    </AdminPage>
  )
}
