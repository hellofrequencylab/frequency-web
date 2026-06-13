// Collaborator featured directory (P3 — partner persona "Collaborator"). The read
// side: members who hold an active Collaborator persona, with a count of the public
// Journeys they've authored, for the browse directory. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'

export interface CollaboratorCard {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  journeyCount: number
}

export async function listCollaborators(): Promise<CollaboratorCard[]> {
  const admin = createAdminClient()

  // Active Collaborator personas (profile_personas isn't in the generated types yet).
  const { data: rows } = await (admin)
    .from('profile_personas')
    .select('profile_id')
    .eq('persona', 'collaborator')
    .neq('state', 'suspended')
  const ids = [...new Set((rows ?? []).map((r: { profile_id: string }) => r.profile_id as string))]
  if (!ids.length) return []

  const [{ data: profiles }, { data: journeys }] = await Promise.all([
    admin.from('profiles').select('id, handle, display_name, avatar_url').in('id', ids).eq('is_active', true),
    admin.from('journey_plans').select('author_id').in('author_id', ids).eq('visibility', 'public'),
  ])

  const counts = new Map<string, number>()
  for (const j of journeys ?? []) {
    const a = j.author_id as string | null
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1)
  }

  return (profiles ?? [])
    .filter((p): p is typeof p & { handle: string } => !!p.handle)
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      displayName: p.display_name ?? p.handle,
      avatarUrl: p.avatar_url,
      journeyCount: counts.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.journeyCount - a.journeyCount || a.displayName.localeCompare(b.displayName))
}
