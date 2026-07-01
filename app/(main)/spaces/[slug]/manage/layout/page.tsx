import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import {
  resolveMode,
  listVariantsForType,
  modeHasFocusChoice,
} from '@/lib/spaces/modes'
import {
  SPACE_TEMPLATES,
  SPACE_TEMPLATE_LABEL,
  templateForSpace,
  readTemplateOverride,
} from '@/lib/spaces/templates'
import { generateSpacePreset, readStoredSpaceDoc, spacePuckData } from '@/lib/page-editor/templates/space'
import { readBlockRows, withVisibleBlocks } from '@/lib/page-editor/templates/space-blocks'
import { readCoverSize } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { FocusTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import {
  SpacePagePanel,
  type LayoutPreview,
  type FocusChoiceLike,
} from '@/components/spaces/space-page-panel'

// SPACE PAGE SETTINGS (ADR-472, the public-page layout layer). The "Page" quick-edit surface in the
// unified console: a compact panel for FAST tweaks (layout, cover size, theme/accent, and block order +
// show/hide) with NO Puck runtime, plus a "Full page editor" button that opens the COMPLETE Puck editor
// as a fullscreen overlay for deep block editing (lazy-loaded, so this page ships no editor code). A
// Server Component, gated server-side exactly like the console + mode pages: it resolves the Space, gates
// on resolveSpaceManageAccess, and notFound()s otherwise so a non-manager cannot tell the route exists. A
// staff previewer sees the panel read-only (every write re-gates in its server action; this render gate
// is UX).

export const metadata: Metadata = {
  title: 'Page',
  description: 'Set your public page layout, cover, accent, and block order, or open the full editor.',
  robots: { index: false, follow: false },
}

// The one-line forward FUNCTION per template (CONTENT-VOICE: plain noun phrase, no em dashes).
const TEMPLATE_BLURB: Record<string, string> = {
  book: 'A booking calendar, with your time as the product.',
  schedule: 'A recurring schedule of classes and events, plus tickets.',
  storefront: 'A product catalog people can browse.',
  hub: 'A mission and community hub, with all your functions on.',
}

export default async function SpacePageSettingsPage({
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
  if (!isConsoleSpaceType(space.type)) notFound()

  const brandName = space.brandName?.trim() || space.name
  const resolverInput = {
    type: space.type,
    variant: space.modeVariant,
    plan: space.plan,
    preferences: space.preferences,
  }
  const activeTemplate = templateForSpace(resolverInput)
  const overrideIsAuto = readTemplateOverride(space.preferences) === null
  const customized = readStoredSpaceDoc(space.preferences) !== null
  const coverSize = readCoverSize(space.preferences)

  // The current landing doc (stored-or-preset). The Blocks list reads its TOP-LEVEL blocks WITH the
  // hidden flag intact (so the panel shows a hidden block as toggle-able); the Full page editor opens on
  // the same doc with hidden blocks stripped (hiding lives only in the compact panel).
  const presetInput = { name: brandName, ...resolverInput }
  const currentDoc = spacePuckData(presetInput)
  const blocks = readBlockRows(currentDoc)
  const editorData = withVisibleBlocks(currentDoc)

  // The four layout previews (generated presets), each named by its forward function.
  const previews: LayoutPreview[] = SPACE_TEMPLATES.map((template) => ({
    template,
    label: SPACE_TEMPLATE_LABEL[template],
    blurb: TEMPLATE_BLURB[template] ?? '',
    data: generateSpacePreset(template, brandName),
  }))

  // The live Space content (identity + highlights) so the previews resolve like the public landing (the
  // same metadata.space the public renderer + edit-page pass to <Render>).
  const spaceContent = await getSpaceContentData(space.id, {
    name: brandName,
    type: space.type,
    logoUrl: space.brandLogoUrl,
    coverUrl: space.coverImageUrl,
    tagline: space.tagline,
    statsInput: resolverInput,
  })

  // The Focus echo: reuse the mode page's model (the type's variants, default first). Only when the Mode
  // has more than one Focus; otherwise omit the section.
  const mode = resolveMode(space.type, space.modeVariant)
  const focusChoices: FocusChoiceLike[] =
    mode && modeHasFocusChoice(space.type)
      ? listVariantsForType(space.type).map((m) => ({
          variant: m.variant,
          label: m.focusLabel,
          tagline: m.tagline,
          active: m.variant === mode.variant,
        }))
      : []

  return (
    <FocusTemplate
      eyebrow="Manage space"
      title="Page"
      description="Set your public page: pick a layout, size your cover, choose your accent, and reorder or hide blocks. Open the full editor to add and edit any block."
      back={{ href: `/spaces/${slug}/manage`, label: brandName }}
      width="wide"
    >
      {staffViewing && !canManage && (
        <div className="mb-6">
          <StaffPreviewBanner spaceName={brandName} />
        </div>
      )}
      <SpacePagePanel
        slug={slug}
        brandName={brandName}
        activeTemplate={activeTemplate}
        overrideIsAuto={overrideIsAuto}
        customized={customized}
        coverSize={coverSize}
        accent={space.brandAccent ?? ''}
        blocks={blocks}
        editorData={editorData}
        previews={previews}
        metadata={{ space: spaceContent }}
        focus={focusChoices.length > 0 ? { choices: focusChoices } : null}
        readOnly={staffViewing && !canManage}
      />
    </FocusTemplate>
  )
}
