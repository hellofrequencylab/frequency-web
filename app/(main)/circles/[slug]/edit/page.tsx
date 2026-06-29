import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleDraft } from '@/lib/circles/draft'
import { CircleBuilder } from '@/components/circles/builder/circle-builder'

// The Starter Circle builder route (Stage 4). Server component: resolve the circle
// id from the slug, load the editable draft, and host-gate it (only the draft's Host
// may edit; anyone else is bounced to the public Circle page). The client builder
// then drives autosave + Vera against the contract actions.
export const dynamic = 'force-dynamic'

export default async function EditCirclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  if (!caller) redirect(`/circles/${slug}`)

  // Resolve the circle id from the slug (the draft layer keys off the id).
  const admin = createAdminClient()
  const { data: row } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (!row) notFound()

  const draft = await getCircleDraft((row as { id: string }).id)
  if (!draft) notFound()

  // Host gate: only the owner edits. Everyone else reads the public Circle page.
  if (draft.hostId !== caller.id) redirect(`/circles/${slug}`)

  return <CircleBuilder draft={draft} />
}
