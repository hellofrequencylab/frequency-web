import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DetailTemplate } from '@/components/templates'
import { SignInCta } from '@/components/discover/cards'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema } from '@/lib/jsonld'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { readTagline } from '@/lib/spaces/tagline'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { readCoverFocus } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

// Public share URL for a networked Space (SCAN-644 / ADR-1465). Auth during
// render is a dynamic API and would void ISR; signed-in members rewrite to
// /spaces/<slug>/full so follow, owner tools, and private Spaces stay on the
// existing profile. This file lives outside (main) so the share URL is not
// voided by that layout's cookies()/headers() or by getMyProfileId.
export const revalidate = 3600

export async function generateStaticParams() {
  const spaces = await listNetworkedSpaces({ sort: 'name' }).catch(() => [])
  return spaces.slice(0, 200).map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) return { title: 'Space not found', robots: { index: false, follow: false } }
  return spaceProfileMetadata(slug)
}

export default async function PublicSpacePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) notFound()

  const brandName = space.brandName?.trim() || space.name
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  // The cover resolves through the one detail-hero ladder (PROG-P5, ADR-1498), like the 20+
  // entity pages before it: the Space's own cover (or its deterministic stock stand-in, the same
  // photo the OG card draws) is rung 1, and the operator's FOCAL POINT travels with it, which the
  // plain 16:6 crop this page shipped with ignored. The band then renders through the canonical
  // PageHero at the header element's height and overlay, so /admin/elements retunes it with the
  // rest. Service-role reads only, so ISR (`revalidate` above) is untouched.
  const [tagline, hero] = await Promise.all([
    readTagline(space.id),
    resolveDetailHero(`/spaces/${space.slug}`, {
      entityImage: coverSrc,
      entityFocus: readCoverFocus(space.preferences),
    }),
  ])

  return (
    <>
      <JsonLd
        data={[
          spaceSchema({
            slug: space.slug,
            type: space.type,
            name: brandName,
            tagline,
            logoUrl: space.brandLogoUrl,
          }),
          breadcrumbSchema([
            { name: 'Spaces', path: '/spaces' },
            { name: brandName, path: `/spaces/${space.slug}` },
          ]),
        ]}
      />
      <DetailTemplate
        {...hero}
        title={brandName}
        subtitle={tagline ?? undefined}
        back={{ href: '/discover/spaces', label: 'Spaces' }}
      >
        <div className="mx-auto max-w-xl">
          <SignInCta
            title={`Want to know ${brandName}?`}
            body="Sign in free to follow this Space, see what's on, and be a face the host recognizes."
            action={BETA_CTA_LABEL}
            href={BETA_CTA_HREF}
          />
        </div>
      </DetailTemplate>
    </>
  )
}
