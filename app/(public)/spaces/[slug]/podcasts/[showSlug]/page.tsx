import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShowPageView, showPageMetadata } from '@/components/airwaves/show-page-view'
import { assembleShowFeed, listPublicShowsBySpace } from '@/lib/airwaves/shows'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'

// Public Show URL advertised in app/sitemap.ts (SCAN-644). Same feed as the
// member twin. Private Spaces 404 for a null viewer; signed-in members rewrite
// to /spaces/<slug>/full/podcasts/<showSlug>.
export const revalidate = 3600

export async function generateStaticParams() {
  const spaces = await listNetworkedSpaces({ sort: 'name' }).catch(() => [])
  const slice = spaces.slice(0, 80)
  const showsBySpace = await listPublicShowsBySpace(slice.map((s) => s.id)).catch(() => new Map())
  return slice.flatMap((s) =>
    (showsBySpace.get(s.id) ?? []).map((sh) => ({ slug: s.slug, showSlug: sh.slug })),
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; showSlug: string }>
}): Promise<Metadata> {
  const { slug, showSlug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) return { title: 'Show not found', robots: { index: false, follow: false } }
  const feed = await assembleShowFeed(space.id, showSlug)
  if (!feed) return { title: 'Show not found' }
  return showPageMetadata(slug, showSlug, feed)
}

export default async function PublicShowPage({
  params,
}: {
  params: Promise<{ slug: string; showSlug: string }>
}) {
  const { slug, showSlug } = await params
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) notFound()
  const feed = await assembleShowFeed(space.id, showSlug)
  if (!feed) notFound()
  return <ShowPageView slug={slug} showSlug={showSlug} space={space} feed={feed} />
}
