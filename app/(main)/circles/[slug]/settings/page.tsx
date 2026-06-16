import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { FocusTemplate } from '@/components/templates'
import { CircleSettingsForm, type CircleSettingsInitial } from './circle-settings-form'

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
}

export default async function CircleSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data } = await admin
    .from('circles')
    .select('id, name, about, type, member_cap, image_url, city, neighborhood, resonance_public')
    .eq('slug', slug)
    .maybeSingle()
  const circle = data as CircleSettingsRow | null
  if (!circle) notFound()

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) notFound()

  const initial: CircleSettingsInitial = {
    name: circle.name ?? '',
    about: circle.about ?? '',
    type: circle.type ?? 'in-person',
    memberCap: circle.member_cap ?? 12,
    imageUrl: circle.image_url ?? '',
    city: circle.city ?? '',
    neighborhood: circle.neighborhood ?? '',
    resonancePublic: circle.resonance_public ?? false,
  }

  return (
    <FocusTemplate title="Circle settings" back={{ href: `/circles/${slug}`, label: 'Back to circle' }}>
      <div className="rounded-xl border border-border bg-surface p-5">
        <CircleSettingsForm circleId={circle.id} slug={slug} initial={initial} />
      </div>
    </FocusTemplate>
  )
}
