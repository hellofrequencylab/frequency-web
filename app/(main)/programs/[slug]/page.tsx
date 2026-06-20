import type { Metadata } from 'next'
import { Zap } from 'lucide-react'
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
    <DetailTemplate
      back={{ href: '/programs', label: 'Programs' }}
      title={program.title}
      subtitle={program.description ?? undefined}
      badges={
        <>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-bg text-primary-strong font-medium">
            {program.audience === 'host' ? 'For hosts' : 'For everyone'}
          </span>
          {program.duration && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-subtle font-medium">
              {program.duration}
            </span>
          )}
        </>
      }
    >
      <div className="max-w-2xl">
        {program.headerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={program.headerImage}
            alt=""
            className="mb-6 h-48 w-full rounded-2xl object-cover"
          />
        )}

        {program.reward && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-bg/40 px-4 py-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 fill-warning text-warning" aria-hidden />
            <p className="text-sm text-text">
              <span className="font-semibold text-warning">What you earn: </span>
              {program.reward}{' '}
              <span className="text-subtle">
                Rewards come from doing the steps, not from reading.
              </span>
            </p>
          </div>
        )}

        <HelpMarkdown>{program.body}</HelpMarkdown>

        {profileId && (
          <div className="mt-8 border-t border-border pt-6">
            <CompleteProgramButton slug={slug} completed={completed} />
          </div>
        )}
      </div>
    </DetailTemplate>
  )
}
