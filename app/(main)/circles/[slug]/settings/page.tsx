import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { CircleSettingsForm, type CircleSettingsInitial } from './circle-settings-form'
import { CircleEditorWindow } from '@/components/studio/circle/circle-editor-window'
import { asCircleAccess, availableAccessModes } from '@/lib/circles/visibility'

// The host's full-page circle settings editor (gated by circle.editSettings → host, scope leader,
// or admin). Reuses updateCircleSettings, which writes only host-owned fields.
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Circle settings' }

interface CircleSettingsRow {
  id: string
  name: string | null
  about: string | null
  type: string | null
  member_cap: number | null
  image_url: string | null
  city: string | null
  neighborhood: string | null
  resonance_public: boolean | null
  unlisted: boolean | null
  access: string | null
  space_id: string | null
}

export default async function CircleSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data } = await admin
    .from('circles')
    .select('id, name, about, type, member_cap, image_url, city, neighborhood, resonance_public, unlisted, access, space_id')
    .eq('slug', slug)
    .maybeSingle()
  const circle = data as CircleSettingsRow | null
  if (!circle) notFound()

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) notFound()

  // Which access modes to OFFER (ADR-1015). A personal Circle sits on the root Space sentinel, so
  // the two Space modes are nonsense there, and `tier` additionally needs a selling plan. The
  // database refuses both regardless (`trg_circles_access_shape`); this only keeps the form from
  // offering a choice that cannot be saved.
  const { data: spaceRow } = circle.space_id
    ? await admin.from('spaces').select('type, plan').eq('id', circle.space_id).maybeSingle()
    : { data: null }
  const space = spaceRow as { type: string | null; plan: string | null } | null

  const initial: CircleSettingsInitial = {
    name: circle.name ?? '',
    about: circle.about ?? '',
    type: circle.type ?? 'in-person',
    memberCap: circle.member_cap ?? 12,
    imageUrl: circle.image_url ?? '',
    city: circle.city ?? '',
    neighborhood: circle.neighborhood ?? '',
    resonancePublic: circle.resonance_public ?? false,
    unlisted: circle.unlisted ?? false,
    access: asCircleAccess(circle.access),
  }

  return (
    <CircleEditorWindow slug={slug}>
      <CircleSettingsForm
        circleId={circle.id}
        slug={slug}
        initial={initial}
        accessModes={availableAccessModes(space)}
      />
    </CircleEditorWindow>
  )
}
