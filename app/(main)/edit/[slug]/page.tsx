import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import type { Data } from '@/lib/page-editor/types'
import { getJanitor } from '@/lib/page-editor/guard'
import { getPage, isEditableSlug, EDITABLE_PAGES } from '@/lib/page-editor/data'
import { getTemplate, isWellFormed } from '@/lib/page-editor/templates'
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
  // ALWAYS prefer the saved draft. Seed from the template only when there is no draft
  // at all.
  //
  // This used to require every block to still be a KNOWN type, which quietly made a
  // renamed block destroy an author's work: the janitor opened the editor, saw the code
  // template instead of their draft, published, and the draft was gone. Three real drafts
  // were one click from that (/about, /how-it-works, /the-lab — ADR-975 D-9). A document
  // is now kept whenever it is well-formed; an unresolvable block renders as a labelled
  // placeholder here and as nothing on the live page, and round-trips untouched on save.
  const data: Data = isWellFormed(page?.data) ? (page!.data as Data) : getTemplate(slug) ?? EMPTY

  // Currently overriding the coded design? (a non-empty published document)
  const pub = page?.published_data as Data | null
  const published = !!(pub && Array.isArray(pub.content) && pub.content.length > 0)

  return <PageEditor slug={slug} title={meta.title} data={data} published={published} />
}
