import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChannelCapabilities } from '@/lib/core/load-capabilities'
import { getPillars } from '@/lib/pillars'
import { FocusTemplate } from '@/components/templates'
import { ChannelEditForm } from './channel-edit-form'

// EDIT A CHANNEL (ADR-882) — the dedicated editor, the counterpart to /events/<slug>/edit.
//
// Channels had two operator surfaces and neither was a real editor: the autosave drawer (good for a
// quick tweak, but it cannot own the URL, and it renders inside a panel) and the Manage hub (the
// console: members, Circles, the Program). This route is the third and the one Events always had —
// the whole record on one page, one Save, and the destructive controls at the bottom.
//
// Gating matches every other channel surface: channel.manage resolves to platform staff (topical
// channels are platform-curated), and anyone else gets a 404 so the route confirms nothing. Every
// action re-checks the same capability server-side (ADR-274); this is only the affordance.
//
// Chrome: FocusTemplate, the single-task work surface. This route keeps the GLOBAL community rail
// (lib/layout/page-chrome.ts pins /channels/<id>/edit as 'global'; only the Channel DETAIL page is
// 'scoped', via SCOPED_PATTERNS), so the admin rail's Channel modules remain one tap away.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit Channel' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ChannelEditRow {
  id: string
  name: string
  slug: string
  description: string | null
  category: string
  cover_image: string | null
  display_order: number
  is_active: boolean
  pillar_id: string | null
}

export default async function EditChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  // The route accepts the DB id or the slug, same as the Channel page and its Manage hub.
  const matchField = UUID_RE.test(id) ? 'id' : 'slug'
  const { data } = await admin
    .from('topical_channels')
    .select('id, name, slug, description, category, cover_image, display_order, is_active, pillar_id')
    .eq(matchField, id)
    .maybeSingle()
  // No is_active filter: an ARCHIVED Channel must still be editable, otherwise archiving one would
  // be a one-way door.
  const channel = data as unknown as ChannelEditRow | null
  if (!channel) notFound()

  const caps = await getChannelCapabilities(channel.id)
  if (!caps.has('channel.manage')) notFound()

  const pillars = (await getPillars()).map((p) => ({ id: p.id, name: p.name }))

  return (
    <FocusTemplate
      eyebrow="Edit Channel"
      title={channel.name}
      description="Everything about the Channel itself, on one page. Changes apply when you save."
      back={{ href: `/channels/${channel.slug}`, label: 'Back to Channel' }}
      width="wide"
    >
      <ChannelEditForm channel={channel} pillars={pillars} />
    </FocusTemplate>
  )
}
