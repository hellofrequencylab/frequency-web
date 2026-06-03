import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getProgram, getCompletedProgramSlugs } from '@/lib/programs'
import { getMyProfileId } from '@/lib/auth'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { CompleteProgramButton } from '@/components/program/complete-button'
import { DetailTemplate } from '@/components/templates/detail-template'

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

  const profileId = await getMyProfileId()
  const completed = profileId ? (await getCompletedProgramSlugs(profileId)).has(slug) : false

  return (
    <div>
      <Link
        href="/programs"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-subtle hover:text-text transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Programs
      </Link>

      <DetailTemplate
        title={program.title}
        subtitle={program.description ?? undefined}
        badges={
          <>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-primary-bg text-primary-strong font-medium">
              {program.audience === 'host' ? 'For hosts' : 'For everyone'}
            </span>
            {program.duration && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-surface-elevated text-subtle font-medium">
                {program.duration}
              </span>
            )}
          </>
        }
      >
        <div className="max-w-2xl">
          <HelpMarkdown>{program.body}</HelpMarkdown>

          {profileId && (
            <div className="mt-8 border-t border-border pt-6">
              <CompleteProgramButton slug={slug} completed={completed} />
            </div>
          )}
        </div>
      </DetailTemplate>
    </div>
  )
}
