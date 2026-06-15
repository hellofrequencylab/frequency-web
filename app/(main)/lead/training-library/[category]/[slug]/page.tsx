import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireLeadFloor } from '@/lib/admin/guard'
import { getTrainingDoc, trainingHref, TRAINING_BASE } from '@/lib/leader-training/content'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { DetailTemplate } from '@/components/templates'

// A single Leader Training guide. Reuses the help center's <HelpMarkdown> renderer
// (one rendering path, no bespoke Markdown) inside the page-kit DetailTemplate.
// Leader-gated: the parent /lead layout runs requireLeadFloor(); re-asserted here so
// the gate is fail-closed even if this page is reached directly.
type Params = { params: Promise<{ category: string; slug: string }> }

export async function generateMetadata({ params }: Params) {
  const { category, slug } = await params
  const found = await getTrainingDoc(category, slug)
  if (!found) return {}
  return { title: `${found.doc.title} | Leader Training`, description: found.doc.description }
}

export default async function LeaderTrainingDocPage({ params }: Params) {
  await requireLeadFloor()
  const { category, slug } = await params
  const found = await getTrainingDoc(category, slug)
  if (!found) notFound()
  const { doc, category: cat } = found

  const idx = cat.docs.findIndex((d) => d.slug === doc.slug)
  const prev = idx > 0 ? cat.docs[idx - 1] : null
  const next = idx < cat.docs.length - 1 ? cat.docs[idx + 1] : null

  return (
    <DetailTemplate
      title={doc.title}
      subtitle={
        <>
          <Link href={TRAINING_BASE} className="hover:text-text">
            {cat.title}
          </Link>
          {doc.updated && <> · Updated {doc.updated}</>}
        </>
      }
      back={{ href: TRAINING_BASE, label: 'Leader Training' }}
    >
      <div className="max-w-3xl">
        {doc.description && <p className="text-lg text-muted">{doc.description}</p>}

        <div className="mt-8">
          <HelpMarkdown>{doc.body}</HelpMarkdown>
        </div>

        {doc.updated && (
          <p className="mt-10 border-t border-border pt-4 text-xs text-subtle">
            Last updated {doc.updated}
          </p>
        )}

        <nav className="mt-6 flex justify-between gap-4 text-sm">
          {prev ? (
            <Link href={trainingHref(cat.slug, prev.slug)} className="text-primary-strong hover:underline">
              &larr; {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={trainingHref(cat.slug, next.slug)}
              className="text-right text-primary-strong hover:underline"
            >
              {next.title} &rarr;
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </DetailTemplate>
  )
}
