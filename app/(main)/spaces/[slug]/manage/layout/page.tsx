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
import { generateSpacePreset, readStoredSpaceDoc } from '@/lib/page-editor/templates/space'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { FocusTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import {
  SpaceLayoutPanel,
  type LayoutPreview,
  type FocusChoiceLike,
} from '@/components/spaces/space-layout-panel'

// SPACE LAYOUT SETTINGS (ADR-472, the public-page layout layer). The Layout surface in the unified
// console where an operator picks the STARTING layout their public landing renders through, previews each
// of the four templates, and (as a thin echo) switches the Focus. A Server Component, gated server-side
// exactly like the console + mode pages: it resolves the Space, gates on resolveSpaceManageAccess, and
// notFound()s otherwise so a non-manager cannot tell the route exists. A staff previewer sees the gallery
// read-only (every write re-gates in its server action; this render gate is UX).

export const metadata: Metadata = {
  title: 'Layout',
  description: 'Pick the layout your public page starts from and preview each one.',
  robots: { index: false, follow: false },
}

// The one-line forward FUNCTION per template (CONTENT-VOICE: plain noun phrase, no em dashes).
const TEMPLATE_BLURB: Record<string, string> = {
  book: 'A booking calendar, with your time as the product.',
  schedule: 'A recurring schedule of classes and events, plus tickets.',
  storefront: 'A product catalog people can browse.',
  hub: 'A mission and community hub, with all your functions on.',
}

export default async function SpaceLayoutPage({
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
      title="Layout"
      description="Pick the layout your public page starts from. Every layout is a start point, not a lock: you can rearrange any page in the editor after."
      back={{ href: `/spaces/${slug}/manage`, label: brandName }}
      width="wide"
    >
      {staffViewing && !canManage && (
        <div className="mb-6">
          <StaffPreviewBanner spaceName={brandName} />
        </div>
      )}
      <SpaceLayoutPanel
        slug={slug}
        activeTemplate={activeTemplate}
        overrideIsAuto={overrideIsAuto}
        customized={customized}
        previews={previews}
        metadata={{ space: spaceContent }}
        focus={focusChoices.length > 0 ? { choices: focusChoices } : null}
        readOnly={staffViewing && !canManage}
      />
    </FocusTemplate>
  )
}
