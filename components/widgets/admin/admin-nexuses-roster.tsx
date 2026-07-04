import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSection } from '@/components/templates'
import { NexusesClient } from '@/app/(main)/admin/nexuses/nexuses-client'

// Admin Nexuses layout module (ADR-270/294): the nexus roster — the editable table of every nexus
// with its hub count, member cap, mentor, and status, plus the "no nexuses yet" first-use empty. A
// self-fetching RSC: it reads the nexuses and the mentor options (the edit form's dropdown) itself,
// so the page hands it nothing. The ?edit=<id> deep-link (the "Edit nexus" button on a nexus page)
// is a searchParams facet a nested module never receives as a prop, so it's read from the x-search
// request header the proxy stamps (proxy.ts) — the same seam the admin practices library uses. The
// page keeps its mentor + structure-staff gate; this renders only through it, so it never re-gates.

type RawNexusRow = {
  id: string
  name: string
  status: string
  member_cap: number
  mentor_id: string | null
  mentor: { id: string; display_name: string } | null
  hubs: { id: string }[]
}

export async function AdminNexusesRoster() {
  const admin = createAdminClient()

  const [{ data: rawNexuses }, { data: mentors }] = await Promise.all([
    admin
      .from('nexuses')
      .select(`id, name, status, member_cap, mentor_id,
               mentor:profiles!mentor_id ( id, display_name ),
               hubs ( id )`)
      .order('name'),
    admin
      .from('profiles')
      .select('id, display_name')
      .eq('community_role', 'mentor')
      .eq('is_active', true)
      .order('display_name'),
  ])

  const typedRawNexuses = (rawNexuses ?? []) as unknown as RawNexusRow[]
  const nexuses = typedRawNexuses.map((n) => ({
    ...n,
    _hub_count: n.hubs?.length ?? 0,
  }))

  // The ?edit=<id> deep-link is a page searchParams facet a nested module never gets as a prop; read
  // it from the x-search header the proxy stamps on every route (the admin-practices-library seam).
  const editId = new URLSearchParams((await headers()).get('x-search') ?? '').get('edit') || null

  return (
    <AdminSection>
      <NexusesClient nexuses={nexuses} mentors={mentors ?? []} initialEditId={editId} />
    </AdminSection>
  )
}
