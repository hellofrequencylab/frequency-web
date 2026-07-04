import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionDef } from '@/lib/spaces/functions'
import { enabledFunctionKeys } from '@/lib/spaces/profile-modules'
import { blocksForKind } from '@/lib/entity-blocks/registry'
import { parseEntityLayout, mergeEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { isError } from '@/lib/action-result'
import {
  BlockGridEditor,
  type GridEditorBlock,
  type LockedGridBlock,
} from '@/components/entity-blocks/block-grid-editor'
import { saveSpaceProfileLayout } from '../actions'

// SPACE GRID BLOCK-PICKER EDITOR (ADR-508, U2b). The grid variant of the S3 profile-layout editor: the
// operator arranges the sections of their space profile INTO A GRID (a template + per-slot drag-and-drop)
// via the SHARED BlockGridEditor, the same editor a member (Spotlight) uses. ADDITIVE: the S3 vertical
// editor at ../ stays until the U3 cutover; this saves the grid EntityLayout to the same
// spaces.preferences.profileLayout node, back-compatible with the S3 shape (a grid write emits no `order`,
// so the S3 read path is undisturbed). Nothing LIVE (the Puck landing) changes.
//
// GATING mirrors the sibling: resolve the Space (404 on missing/not-visible, no existence leak), gate
// RENDER on canManage || staffViewing, and the WRITE action re-gates on canManage server-side (a staff
// janitor sees the editor read-only end to end). NOINDEX is inherited from the settings layout. No em dashes.

export const metadata = {
  title: 'Profile grid',
}

export default async function SpaceProfileGridPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name
  const spaceId = space.id

  // The unified space palette, split into arrangeable vs feature-locked (a DATA block whose required
  // function is off). Locked blocks are never arrangeable; they re-appear when the feature turns on.
  const enabled = enabledFunctionKeys(space)
  const spaceBlocks = blocksForKind('space')
  const isLocked = (requiresFunction: (typeof spaceBlocks)[number]['requiresFunction']) =>
    requiresFunction != null && !enabled.has(requiresFunction)

  const palette: GridEditorBlock[] = spaceBlocks
    .filter((b) => !isLocked(b.requiresFunction))
    .map((b) => ({ id: b.id, label: b.label, description: b.description }))

  const locked: LockedGridBlock[] = spaceBlocks
    .filter((b) => isLocked(b.requiresFunction))
    .map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description,
      featureLabel: (b.requiresFunction && spaceFunctionDef(b.requiresFunction)?.label) || 'the feature',
    }))

  // The effective grid: the fresh default (every non-locked block) with the operator's saved grid merged
  // over it. Fail-safe: a malformed node parses to null and the fresh default stands.
  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const saved = parseEntityLayout(rawLayout)
  const effective = mergeEntityLayout(palette.map((b) => b.id), saved, 'space')

  async function onSave(layout: EntityLayout): Promise<{ error?: string }> {
    'use server'
    const res = await saveSpaceProfileLayout(spaceId, layout)
    return isError(res) ? { error: res.error } : {}
  }

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Profile grid"
      description="Arrange your space page into a grid. Pick a layout, then drag each block into a column or turn it off."
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <BlockGridEditor
        kind="space"
        template={effective.template ?? 'single'}
        slots={effective.slots ?? {}}
        palette={palette}
        locked={locked}
        featuresHref={`/spaces/${space.slug}/settings/features`}
        previewHref={`/spaces/${space.slug}/profile-preview`}
        onSave={onSave}
        readOnly={staffViewing}
      />
    </FocusTemplate>
  )
}
