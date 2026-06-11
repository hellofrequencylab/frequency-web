import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { NexusesClient } from './nexuses-client'
import { NewNexusCompose } from '@/components/compose/new-nexus-compose'


export default async function AdminNexusesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin('mentor', { staff: 'structure' })
  const { edit } = await searchParams

  const admin = createAdminClient()
  const { data: rawNexuses } = await admin
    .from('nexuses')
    .select(`id, name, status, member_cap, mentor_id,
             mentor:profiles!mentor_id ( id, display_name ),
             hubs ( id )`)
    .order('name')

  type RawNexusRow = {
    id: string; name: string; status: string; member_cap: number; mentor_id: string | null;
    mentor: { id: string; display_name: string } | null; hubs: { id: string }[];
  }
  const typedRawNexuses = (rawNexuses ?? []) as unknown as RawNexusRow[]
  const nexuses = typedRawNexuses.map((n) => ({
    ...n,
    _hub_count: n.hubs?.length ?? 0,
  }))

  const { data: mentors } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('community_role', 'mentor')
    .eq('is_active', true)
    .order('display_name')

  const { data: outposts } = await admin
    .from('outposts')
    .select('id, name')
    .order('name')

  return (
    <AdminTemplate
      title="Nexuses"
      eyebrow="Structure"
      description="Top-level geographic groupings. Each nexus contains hubs, which contain circles. Assign a mentor to oversee all hubs and circles within."
      actions={<NewNexusCompose outposts={outposts ?? []} />}
      width="wide"
    >
      <AdminSection>
        <NexusesClient nexuses={nexuses} mentors={mentors ?? []} initialEditId={edit ?? null} />
      </AdminSection>
    </AdminTemplate>
  )
}
