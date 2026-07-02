import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import type { Data } from '@/lib/page-editor/types'
import { getJanitor } from '@/lib/page-editor/guard'
import { getPage, isEditableSlug, EDITABLE_PAGES } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { PageEditor } from '@/components/page-editor/editor'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false } }

const EMPTY: Data = { content: [], root: {} }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  if (!(await getJanitor())) notFound()
  const { slug } = await params
  if (!isEditableSlug(slug)) redirect('/pages')

  const page = await getPage(slug)
  const meta = EDITABLE_PAGES.find((p) => p.slug === slug)!
  // Prefer the saved draft, but only if every block in it is still a known block
  // type. Otherwise seed from the standard-block template (or empty). This is a
  // load-time default only — nothing is persisted until the janitor Publishes.
  const data: Data = isRenderable(page?.data) ? (page!.data as Data) : getTemplate(slug) ?? EMPTY

  // Currently overriding the coded design? (a non-empty published document)
  const pub = page?.published_data as Data | null
  const published = !!(pub && Array.isArray(pub.content) && pub.content.length > 0)

  return <PageEditor slug={slug} title={meta.title} data={data} published={published} />
}
