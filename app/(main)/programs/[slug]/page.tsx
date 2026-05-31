import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getProgram } from '@/lib/programs'
import { HelpMarkdown } from '@/components/help/help-markdown'

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const program = await getProgram(slug)
  if (!program) return {}
  return { title: program.title, description: program.description }
}

export default async function ProgramPage({ params }: Params) {
  const { slug } = await params
  const program = await getProgram(slug)
  if (!program) notFound()

  return (
    <article className="max-w-2xl">
      <Link
        href="/programs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-subtle hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Programs
      </Link>

      <h1 className="font-display text-3xl text-text">{program.title}</h1>
      {program.description && <p className="mt-2 text-lg text-muted">{program.description}</p>}
      <div className="mt-1 text-xs text-subtle">
        {program.audience === 'host' ? 'For hosts' : 'For everyone'}
        {program.duration ? ` · ${program.duration}` : ''}
      </div>

      <div className="mt-8">
        <HelpMarkdown>{program.body}</HelpMarkdown>
      </div>
    </article>
  )
}
