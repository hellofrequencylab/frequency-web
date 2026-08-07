// Program — the owner surface for Programs on Channels. A Space (Collective business member) runs its
// model as a Program: a Channel it owns (topical_channels.owner_space_id) whose Chapter blueprint
// (template_id) is a snapshot of its flagship circle, so members anywhere can start Chapters from it.
// Mirrors the sibling settings-page pattern (collaborators / airwaves): resolve the caller, resolve +
// gate the Space (canManage || staffViewing, else 404 with no existence leak), feature-lock on the
// `program` function, and frame the body in the FocusTemplate. The chrome auto-registers via the
// /spaces/<slug>/settings* pattern in page-chrome.ts, so no rail edit is needed. v1 was create-only;
// ADR-869 makes this a real editor: display copy, blueprint refresh, and pause/resume are self-serve.
// Deleting a Program stays a crew call (the quiet note at the bottom says so).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Network, UsersRound } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Button, buttonClasses } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { UpsellTease } from '@/components/upsell/upsell-tease'
import { resolveSpaceTeaseGate } from '@/lib/pricing/tease-gate'
import { listCirclesForSpace } from '@/lib/circles/store'
import { listSpacePrograms, listChapters } from '@/lib/channels/programs'
import {
  createSpaceProgramAction,
  updateSpaceProgramAction,
  refreshProgramBlueprintAction,
  setProgramPausedAction,
} from './actions'

export const metadata = { title: 'Program' }

// Plain-voice copy for the short error codes the actions bounce back with.
const ERROR_COPY: Record<string, string> = {
  denied: 'You do not have access to do that here.',
  missing: 'Fill in every field before saving.',
  circle: 'Pick one of your own live circles as the blueprint.',
  failed: 'That did not go through. Try again in a moment.',
}

export default async function SpaceProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const [{ slug }, { error, saved }] = await Promise.all([params, searchParams])
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
        <p className="rounded-card border border-border bg-surface p-6 text-body-sm text-muted">
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

  // BETA FOUNDER PUSH (ADR-875) / Phase E tease (ADR-466). Running a Program is Collective depth. While
  // the beta grace window is open this Space HAS it without paying, so the resolver hands back the warm
  // notice ("You are using Collective tools", when memberships start, and the founder invite) rather
  // than any claim of a lock. Once the gates bite it becomes the ordinary tease. A Space that already
  // pays, by Stripe or by cash, and a Founding Business are resolved out inside the resolver.
  const programTease = staffViewing ? null : await resolveSpaceTeaseGate(space, 'program')

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
        {programTease && (
          <UpsellTease
            target="space-program"
            live={programTease.live}
            locked={programTease.locked}
            notice={programTease.notice}
            href={`/spaces/${slug}/settings/billing`}
            title="Keep running your model as a Program"
            body="Collective carries Programs, Chapters, and the Channel your Space owns, plus automation, team roles, and multiple pipelines."
            cta="See what Collective adds"
          />
        )}
        {errorMsg && (
          <p className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-body-sm text-danger">
            {errorMsg}
          </p>
        )}
        {!errorMsg && saved && (
          <p className="rounded-lg border border-success/30 bg-success-bg px-3 py-2 text-body-sm text-success">
            Saved.
          </p>
        )}

        {programs.length > 0 ? (
          <>
            {programs.map((program) => {
              const chapters = chaptersByProgram[program.id] ?? []
              return (
                <div key={program.id} className="space-y-6">
                  <section className="rounded-card border border-border bg-surface p-6">
                    <SectionHeader
                      title={program.name}
                      href={program.isActive ? `/channels/${program.slug}` : undefined}
                      action={
                        program.isActive ? (
                          <Link href={`/channels/${program.slug}`} className={buttonClasses('secondary', 'sm')}>
                            View the Channel
                          </Link>
                        ) : (
                          <span className="rounded-pill border border-warning/60 px-3 py-1 text-meta font-medium text-warning">
                            Paused
                          </span>
                        )
                      }
                    />
                    {program.description && <p className="text-body-sm text-muted">{program.description}</p>}
                    <div className="mt-4 space-y-3 text-body-sm">
                      <p className="flex items-center gap-2 text-text">
                        <UsersRound className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                        {chapters.length === 0
                          ? 'No Chapters yet. The first one starts when a member runs your blueprint.'
                          : chapters.length === 1
                            ? '1 Chapter is running your model.'
                            : `${chapters.length} Chapters are running your model.`}
                      </p>
                      <p className="text-muted">
                        Members see {program.name} as a Channel. They can tune in, follow the feed, find a
                        Chapter near them, or start one from your blueprint.
                      </p>
                    </div>
                  </section>

                  <form
                    action={updateSpaceProgramAction.bind(null, slug, program.id)}
                    className="space-y-4 rounded-card border border-border bg-surface p-6"
                  >
                    <SectionHeader title="Edit your Program" />
                    <p className="text-body-sm text-muted">
                      Renaming keeps the Channel at the same address, so every shared link keeps working.
                    </p>
                    <Field label="Program name" hint="The name members see on the Channel.">
                      <Input name="name" required maxLength={80} defaultValue={program.name} />
                    </Field>
                    <Field label="One liner" hint="One plain sentence on what a Chapter does together.">
                      <Input name="oneLiner" required maxLength={160} defaultValue={program.description ?? ''} />
                    </Field>
                    <Button type="submit">Save changes</Button>
                  </form>

                  <form
                    action={refreshProgramBlueprintAction.bind(null, slug, program.id)}
                    className="space-y-4 rounded-card border border-border bg-surface p-6"
                  >
                    <SectionHeader title="Blueprint" />
                    <p className="text-body-sm text-muted">
                      The blueprint is the snapshot every new Chapter starts from, saved when you created
                      this Program. Refresh it to save the current setup of one of your live circles
                      instead. Chapters already running keep what they have; only future Chapters start
                      from the new snapshot.
                    </p>
                    <Field label="Snapshot from" hint="One of your live circles. Its current setup becomes the new blueprint.">
                      <Select name="sourceCircleId" required defaultValue="">
                        <option value="" disabled>
                          Pick a circle
                        </option>
                        {liveCircles.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button type="submit" variant="secondary">
                      Refresh blueprint
                    </Button>
                  </form>

                  <section className="space-y-4 rounded-card border border-border bg-surface p-6">
                    <SectionHeader title={program.isActive ? 'Pause your Program' : 'Resume your Program'} />
                    <p className="text-body-sm text-muted">
                      {program.isActive
                        ? 'Paused: the Channel page is hidden and no new Chapters can start. Members and Chapters keep everything they have.'
                        : 'This Program is paused. The Channel page is hidden and no new Chapters can start. Resuming brings both straight back.'}
                    </p>
                    <form action={setProgramPausedAction.bind(null, slug, program.id, program.isActive)}>
                      <Button type="submit" variant={program.isActive ? 'warningOutline' : 'successOutline'}>
                        {program.isActive ? 'Pause Program' : 'Resume Program'}
                      </Button>
                    </form>
                  </section>
                </div>
              )
            })}
            <p className="text-meta text-subtle">Deleting a Program goes through the crew. Everything else here is yours.</p>
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
            className="space-y-4 rounded-card border border-border bg-surface p-6"
          >
            <SectionHeader title="Create your Program" />
            <p className="text-body-sm text-muted">
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
              <Select name="sourceCircleId" required defaultValue="">
                <option value="" disabled>
                  Pick a circle
                </option>
                {liveCircles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Create Program</Button>
          </form>
        )}
      </div>
    </FocusTemplate>
  )
}
