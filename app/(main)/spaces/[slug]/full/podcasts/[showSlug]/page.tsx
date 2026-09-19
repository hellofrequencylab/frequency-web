import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ShowPageView, showPageMetadata } from '@/components/airwaves/show-page-view'
import { assembleShowFeed } from '@/lib/airwaves/shows'
import { getVisibleSpaceForRequest } from '@/lib/spaces/visible-space-for-request'

// Signed-in members land here via proxy rewrite (lib/nav/member-space-rewrite.ts).
// Private Spaces resolve with the viewer; the share URL stays
// /spaces/<slug>/podcasts/<showSlug>.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; showSlug: string }>
}): Promise<Metadata> {
  const { slug, showSlug } = await params
  const space = await getVisibleSpaceForRequest(slug)
  if (!space) return { title: 'Show not found', robots: { index: false, follow: false } }
  const feed = await assembleShowFeed(space.id, showSlug)
  if (!feed) return { title: 'Show not found' }
  return showPageMetadata(slug, showSlug, feed)
}

export default async function MemberShowPage({
  params,
}: {
  params: Promise<{ slug: string; showSlug: string }>
}) {
  const { slug, showSlug } = await params
  const space = await getVisibleSpaceForRequest(slug)
  if (!space) notFound()
  const feed = await assembleShowFeed(space.id, showSlug)
  if (!feed) notFound()
  return <ShowPageView slug={slug} showSlug={showSlug} space={space} feed={feed} />
}
