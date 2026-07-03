import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'
import { createClient } from '@/lib/supabase/server'
import { defaultMemberLayout } from '@/lib/entity-blocks/context'
import { blocksForKind } from '@/lib/entity-blocks/registry'
import { mergeEntityLayout } from '@/lib/entity-blocks/layout'
import { readMemberGridLayout } from '@/lib/entity-blocks/member-grid-meta'
import { BlockGridEditor, type GridEditorBlock } from '@/components/entity-blocks/block-grid-editor'
import { saveMemberGridLayout } from '@/app/(main)/settings/profile/spotlight-actions'

// MEMBER GRID BLOCK-PICKER EDITOR (ADR-508, U2b). The member (Spotlight) side of the SHARED grid editor:
// the member arranges their profile into a grid (a template + per-slot drag-and-drop) via the same
// BlockGridEditor a space uses. ADDITIVE: this saves the grid EntityLayout to profiles.meta.entityGrid,
// DELIBERATELY SEPARATE from the live Spotlight nodes (meta.spotlight.layout / theme / background), so
// nothing the public Puck Spotlight renders changes. The module preview at ../ reads it in U3.
//
// GATE: the member THEMSELVES only. We resolve the CALLER's own profile by their session (auth_user_id,
// always readable) and 404 unless their handle matches the route, so the route never reads another
// member's meta and never leaks existence. NOINDEX. No em dashes.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Profile grid',
  robots: { index: false, follow: false },
}

export default async function MemberProfileGridEditPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params

  // Resolve the CALLER's own profile from the session. Reading your own row is always permitted; we then
  // gate to self by matching the route handle, so a non-owner 404s without any cross-row read.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const row = me as { id: string; handle: string | null; meta: unknown; display_name: string | null } | null
  if (!row || row.handle !== handle) notFound()

  // The unified member palette (about/stats/links/topfriends + authored content blocks), in the curated
  // default order. Members have no feature-locked blocks, so there is no locked list.
  const byId = new Map(blocksForKind('member').map((b) => [b.id, b]))
  const defaultIds = defaultMemberLayout()
  const palette: GridEditorBlock[] = defaultIds
    .map((id) => byId.get(id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .map((b) => ({ id: b.id, label: b.label, description: b.description }))

  // The effective grid: the fresh member default with the member's saved grid merged over it. Fail-safe.
  const saved = readMemberGridLayout(row.meta)
  const effective = mergeEntityLayout(defaultIds, saved, 'member')

  const displayName = row.display_name?.trim() || `@${handle}`

  return (
    <FocusTemplate
      eyebrow={displayName}
      title="Profile grid"
      description="Arrange your profile into a grid. Pick a layout, then drag each block into a column or turn it off."
      width="wide"
    >
      <BlockGridEditor
        kind="member"
        template={effective.template ?? 'single'}
        slots={effective.slots ?? {}}
        palette={palette}
        previewHref={`/people/${handle}/profile-preview`}
        onSave={saveMemberGridLayout}
      />

      <p className="mt-6 text-xs text-muted">
        Want to see it live?{' '}
        <Link href={`/people/${handle}/profile-preview`} className="font-semibold text-primary-strong hover:underline">
          Open the profile preview
        </Link>
        .
      </p>
    </FocusTemplate>
  )
}
