import Link from 'next/link'
import { GraduationCap, ArrowRight, Tag, ListChecks } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Banner } from '@/components/admin/status'
import { RoleBadge, ROLE_LABEL } from '@/lib/community-roles'
import { getAllArticles } from '@/lib/help/content'
import { tierCurriculumViews } from '@/lib/onboarding/training-curriculum'
import { loadCurriculum } from '@/lib/onboarding/curriculum-store'
import { staffCanNow } from '@/lib/staff'
import { TierEditor } from './tier-editor'

// Role-advancement training — authoring surface (ADR-224 §7.5). The owner/staff view
// of the curriculum each promotion teaches: per tier (crew → host → guide → mentor),
// the curated registry path, the reward, and the help articles currently `role`-tagged
// for that tier (the editable source a tag-driven curriculum draws from). Community staff
// with write access edit a tier's title, intro and steps in place (LIVE-690); the edit is
// stored over the code registry (lib/onboarding/curriculum-store.ts) and the reward stays
// in code. Reading is gated to community host+ / community staff.

export const dynamic = 'force-dynamic'

export default async function AdminContentTrainingPage() {
  await requireAdmin('host', { staff: 'community' })

  const [articles, curriculum, canEdit] = await Promise.all([
    getAllArticles(),
    loadCurriculum(),
    staffCanNow('community', 'write'),
  ])
  const tiers = tierCurriculumViews(articles, curriculum.defs)

  const definedTiers = tiers.filter((t) => t.def !== null)
  const taggedArticles = articles.filter((a) => a.role)

  return (
    <AdminTemplate
      title="Role training"
      eyebrow="Content"
      icon={GraduationCap}
      description="The advancement curriculum each promotion teaches. When a member is promoted up the trust ladder, this is the curated path through the help center they are walked through."
      width="default"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tiers with a path" value={definedTiers.length} icon={ListChecks} />
          <StatCard label="Curriculum tiers" value={tiers.length} icon={GraduationCap} />
          <StatCard label="Role-tagged articles" value={taggedArticles.length} icon={Tag} />
          <StatCard
            label="Total steps"
            value={definedTiers.reduce((n, t) => n + (t.def?.steps.length ?? 0), 0)}
            icon={ArrowRight}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Authoring"
        description="Two ways to shape a tier's path."
      >
        <Banner tone="info" title="How to edit the curriculum">
          <p className="mt-1">
            <span className="font-semibold text-text">Edit the path here.</span> Use Edit this
            path under a tier to change its title, intro and steps. Members see the change on
            their next visit, and anyone partway through keeps the steps they already finished.
            The Gems a path pays stay fixed.
          </p>
          <p className="mt-2">
            <span className="font-semibold text-text">Tag help articles.</span> Add{' '}
            <code className="rounded bg-surface px-1 py-0.5 text-meta text-text">role: host</code>{' '}
            (or crew / guide / mentor) to a help article&apos;s front-matter and it joins
            that tier&apos;s source set below, ready to link as a step.
          </p>
          {!canEdit && (
            <p className="mt-2 text-meta text-subtle">
              Editing needs community staff write access. You can read every path here.
            </p>
          )}
        </Banner>
      </AdminSection>

      {tiers.map(({ role, def, taggedSteps }) => (
        <AdminSection key={role}>
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <RoleBadge role={role} />
              <h2 className="text-body font-bold text-text">Promoted to {ROLE_LABEL[role]}</h2>
            </div>
            {def?.blurb && <p className="mt-1 text-body-sm text-muted">{def.blurb}</p>}
          </div>
          {!def ? (
            <EmptyState
              variant="first-use"
              icon={GraduationCap}
              title={`No ${ROLE_LABEL[role]} curriculum yet`}
              description="Add a tier definition to the curriculum registry to give this promotion a path."
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-meta text-muted">
                <span className="rounded-md bg-surface-elevated px-2 py-0.5 font-medium text-text">
                  {def.title}
                </span>
                <span className="rounded-md bg-surface-elevated px-2 py-0.5 tabular-nums">
                  {def.steps.length} step{def.steps.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-md bg-surface-elevated px-2 py-0.5 tabular-nums">
                  {def.reward} Gems on completion
                </span>
                {curriculum.edited.includes(role) && (
                  <span className="rounded-control bg-surface-elevated px-2 py-0.5">Edited here</span>
                )}
              </div>

              {canEdit && (
                <TierEditor
                  role={role}
                  initial={{ title: def.title, blurb: def.blurb, steps: def.steps }}
                  edited={curriculum.edited.includes(role)}
                />
              )}

              <div>
                <p className="mb-2 eyebrow text-subtle">
                  Curriculum steps
                </p>
                <ol className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border bg-surface">
                  {def.steps.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-elevated text-meta font-semibold tabular-nums text-muted">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text">
                        {s.label}
                      </span>
                      <Link
                        href={s.href}
                        className="inline-flex items-center gap-1 text-meta font-semibold text-primary hover:underline"
                      >
                        {s.href.replace('/help/', '')}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <p className="mb-2 eyebrow text-subtle">
                  Role-tagged help articles ({taggedSteps.length})
                </p>
                {taggedSteps.length === 0 ? (
                  <EmptyState
                    variant="no-results"
                    icon={Tag}
                    title={`No articles tagged role: ${role} yet`}
                    description="Tag articles in their front-matter to build a tag-driven path for this tier."
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {taggedSteps.map((s) => (
                      <Link
                        key={s.href}
                        href={s.href}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1 text-meta font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
                      >
                        <Tag className="h-3 w-3 text-subtle" />
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </AdminSection>
      ))}
    </AdminTemplate>
  )
}
