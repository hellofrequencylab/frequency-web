import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { readProfileData } from '@/lib/spaces/profile-data'
import { SpaceSetupSpark, type SpaceSetupInitial } from './space-setup-spark'

// SPACE SETUP (ADR-1733). The seeding walk a new Business or Nonprofit Space's owner lands on
// straight from `createSpace` (lib/spaces/provision.ts, `postCreateLanding`), and the "Finish setting
// up" door an older Space's readiness card offers. Every step writes through the Space's existing
// update actions, so this page only reads what is already there and hands it to the Spark.
//
// SECURITY: a Server Component, gated server-side. It resolves the Space, gates RENDER on canManage
// (owner / admin / editor: the writers) and notFound()s otherwise, no existence leak. A staff
// previewer is read-only on the console and is denied here rather than shown a form they cannot
// submit. Console types only (isConsoleSpaceType), the same wall /manage keeps. Every action the
// Spark calls re-checks canEditProfile on its own, so this gate is UX and the actions stay the authority.
//
// THE SHELL LIVES IN THE SPARK (ADR-986, the same shape as services/new and classifieds/new): each
// step's heading, progress cue and Back / Continue footer are client state, so `SparkShell`, the
// kit's wizard shell, is composed inside `SpaceSetupSpark`. A FocusTemplate here would stack a
// second heading lockup over it. check:templates matches literal tags in this file by design, so
// this page sits on scripts/templates-baseline.txt with the three other Spark pages.

export const metadata: Metadata = {
  title: 'Space setup',
  description: 'Set up your space: its story, identity, contact details, and offerings.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SpaceSetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  const profile = readProfileData(space.preferences)
  const socials: Record<string, string> = {}
  for (const s of profile.socials ?? []) socials[s.platform] = s.url

  const initial: SpaceSetupInitial = {
    brandName: space.brandName ?? '',
    tagline: space.tagline ?? '',
    about: space.about ?? '',
    story: profile.about ?? '',
    brandLogoUrl: space.brandLogoUrl,
    brandAccent: space.brandAccent ?? '',
    address: profile.address ?? '',
    hours: profile.hours ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    website: profile.website ?? '',
    socials,
    offerings: profile.offerings ?? [],
  }

  return <SpaceSetupSpark slug={space.slug} spaceId={space.id} spaceName={space.brandName ?? space.name} initial={initial} />
}
