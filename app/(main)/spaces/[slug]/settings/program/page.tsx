// Program — the owner surface for Programs on Channels. A Space (Collective business member) runs its
// model as a Program: a Channel it owns (topical_channels.owner_space_id) whose Chapter blueprint
// (template_id) is a snapshot of its flagship circle, so members anywhere can start Chapters from it.
// Mirrors the sibling settings-page pattern (collaborators / airwaves): resolve the caller, resolve +
// gate the Space (canManage || staffViewing, else 404 with no existence leak), feature-lock on the
// `program` function, and frame the body in the FocusTemplate. The chrome auto-registers via the
// /spaces/<slug>/settings* pattern in page-chrome.ts, so no rail edit is needed. v1 is create + review
// only: no edit or delete (the quiet note below says so).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Network, UsersRound } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Button, buttonClasses } from '@/components/ui/button'
import { Field, Input, fieldClasses } from '@/components/ui/field'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { listCirclesForSpace } from '@/lib/circles/store'
import { listSpacePrograms, listChapters } from '@/lib/channels/programs'
import { createSpaceProgramAction } from './actions'

export const metadata = { title: 'Program' }

// Plain-voice copy for the short error codes the action bounces back with.
const ERROR_COPY: Record<string, string> = {
  denied: 'You do not have access to do that here.',
  missing: 'Give your Program a name, a one liner, and a blueprint circle.',
  circle: 'Pick one of your own live circles as the blueprint.',
  failed: 'That did not go through. Try again in a moment.',
}

export default async function SpaceProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ slug }, { error }] = await Promise.all([params, searchParams])
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked = !staffViewing && !(await spaceFunctionAccessLive(space, 'program', caps.role))

  if (featureLocked) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Program"
        description="Run your model as a Program. Your flagship circle becomes the blueprint, and members start Chapters anywhere."
        back={{ href: `/spaces/${slug}/manage`, label: 'Manage' }}
      >
        <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          Program is turned off for this space, or your role does not include it. An admin can turn it on
          in the module settings.
        </p>
      </FocusTemplate>
    )
  }

  const programs = await listSpacePrograms(space.id)
  const chaptersByProgram = Object.fromEntries(
    await Promise.all(programs.map(async (p) => [p.id, await listChapters(p.id)] as const)),
  )
  // The blueprint candidates: this Space's own live circles (drafts and archived never qualify).
  const liveCircles = (await listCirclesForSpace(space.id)).filter(
    (c) => c.status !== 'draft' && c.status !== 'archived',
  )
  const errorMsg = error ? ERROR_COPY[error] : null

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Program"
      description={
        programs.length > 0
          ? 'Your Program, its Channel, and the Chapters running your model.'
          : 'Run your model as a Program. Your flagship circle becomes the blueprint, and members start Chapters anywhere.'
      }
      back={{ href: `/spaces/${slug}/manage`, label: 'Manage' }}
    >
      <div className="space-y-6">
        {errorMsg && (
          <p className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
            {errorMsg}
          </p>
        )}

        {programs.length > 0 ? (
          <>
            {programs.map((program) => {
              const chapters = chaptersByProgram[program.id] ?? []
              return (
                <section key={program.id} className="rounded-2xl border border-border bg-surface p-6">
                  <SectionHeader
                    title={program.name}
                    href={`/channels/${program.slug}`}
                    action={
                      <Link href={`/channels/${program.slug}`} className={buttonClasses('secondary', 'sm')}>
                        View the Channel
                      </Link>
                    }
                  />
                  {program.description && <p className="text-sm text-muted">{program.description}</p>}
                  <div className="mt-4 space-y-3 text-sm">
                    <p className="flex items-center gap-2 text-text">
                      <UsersRound className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                      {chapters.length === 0
                        ? 'No Chapters yet. The first one starts when a member runs your blueprint.'
                        : chapters.length === 1
                          ? '1 Chapter is running your model.'
                          : `${chapters.length} Chapters are running your model.`}
                    </p>
                    <p className="text-muted">
                      Blueprint: your flagship circle, saved when you created this Program. Every new
                      Chapter starts from that snapshot.
                    </p>
                    <p className="text-muted">
                      Members see {program.name} as a Channel. They can tune in, follow the feed, find a
                      Chapter near them, or start one from your blueprint.
                    </p>
                  </div>
                </section>
              )
            })}
            <p className="text-xs text-subtle">Need a change to your Program? Contact the crew.</p>
          </>
        ) : liveCircles.length === 0 ? (
          <EmptyState
            icon={Network}
            title="Your Program starts with a circle"
            description="A Program turns your flagship circle into a blueprint members can start Chapters from. Create a circle in this space first, then come back."
            action={
              <Link href={`/spaces/${slug}/circles`} className={buttonClasses('secondary', 'sm')}>
                Go to Circles
              </Link>
            }
          />
        ) : (
          <form
            action={createSpaceProgramAction.bind(null, slug)}
            className="space-y-4 rounded-2xl border border-border bg-surface p-6"
          >
            <SectionHeader title="Create your Program" />
            <p className="text-sm text-muted">
              Pick your flagship circle and we save its setup as the blueprint. Your Program gets its own
              Channel, and members anywhere can start a Chapter from it.
            </p>
            <Field label="Program name" hint="The name members see on the Channel.">
              <Input name="name" required maxLength={80} placeholder="MoFlow" />
            </Field>
            <Field label="One liner" hint="One plain sentence on what a Chapter does together.">
              <Input name="oneLiner" required maxLength={160} placeholder="A weekly movement session run by locals, anywhere." />
            </Field>
            <Field label="Blueprint circle" hint="Your flagship circle. Its setup becomes the blueprint every Chapter starts from.">
              <select name="sourceCircleId" required defaultValue="" className={fieldClasses}>
                <option value="" disabled>
                  Pick a circle
                </option>
                {liveCircles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit">Create Program</Button>
          </form>
        )}
      </div>
    </FocusTemplate>
  )
}
