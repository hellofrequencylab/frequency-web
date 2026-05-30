import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import type { Data } from '@measured/puck'
import { getJanitor } from '@/lib/page-editor/guard'
import { getPage, isEditableSlug, EDITABLE_PAGES } from '@/lib/page-editor/data'
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
  const data: Data =
    page?.data && Array.isArray((page.data as Data).content) ? (page.data as Data) : EMPTY

  return <PageEditor slug={slug} title={meta.title} data={data} />
}
