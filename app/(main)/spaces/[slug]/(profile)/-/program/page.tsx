import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { spaceManageHref } from '@/lib/spaces/types'
import { spaceProgramHref } from '@/lib/spaces/primary-nav'
import { LEARNING_KINDS, LEARNING_PAGE_SIZE, learningPageNumber, readSpaceLearningPage, type LearningKind } from '@/lib/spaces/program-catalog'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { EntityCard } from '@/components/cards/entity-card'

const LABEL: Record<LearningKind, string> = { program: 'Programs', journey: 'Journeys', practice: 'Practices' }
const FUNCTION: Record<LearningKind, 'program' | 'journeys' | 'practices'> = { program: 'program', journey: 'journeys', practice: 'practices' }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: '-/program', label: 'Program',
    describe: (name) => `Explore public Programs, Journeys and Practices from ${name}.`,
  })
}

export default async function SpaceLearningPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ programs?: string | string[]; journeys?: string | string[]; practices?: string | string[] }>
}) {
  const [{ slug }, query, caller] = await Promise.all([params, searchParams, getCallerProfile()])
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()
  const access = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const pages = { program: learningPageNumber(query.programs), journey: learningPageNumber(query.journeys), practice: learningPageNumber(query.practices) }
  const enabled = LEARNING_KINDS.filter((kind) => {
    const def = spaceFunctionDef(FUNCTION[kind])
    return !!def && spaceFunctionEnabled(space, def)
  })
  const groups = await Promise.all(enabled.map((kind) => readSpaceLearningPage(space.id, kind, pages[kind])))
  const href = (kind: LearningKind, page: number) => {
    const q = new URLSearchParams()
    for (const k of LEARNING_KINDS) {
      const n = k === kind ? page : pages[k]
      if (n > 1) q.set(`${k}s`, String(n))
    }
    return `${spaceProgramHref(slug)}${q.size ? `?${q}` : ''}`
  }
  const nothing = groups.every((group) => !group.total && !group.unavailable)
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <SectionHeader title="Program" action={access.canManage || access.staffViewing ? <Link href={spaceManageHref(space.type, slug)} className={buttonClasses('secondary', 'sm')}>Manage learning</Link> : undefined} />
        <p className="text-body-sm text-muted">Programs, Journeys and Practices published for everyone by {space.brandName ?? space.name}.</p>
      </div>
      {nothing ? <EmptyState title="Nothing published here yet" description="Public learning offerings will appear here when they are ready." /> : null}
      {groups.filter((group) => group.total > 0 || group.unavailable).map((group) => (
        <section key={group.kind} className="space-y-4" aria-label={LABEL[group.kind]}>
          <SectionHeader title={LABEL[group.kind]} count={group.unavailable ? undefined : group.total} />
          {group.unavailable ? <EmptyState variant="error" title={`Could not load ${LABEL[group.kind].toLowerCase()}`} description="Try again in a moment." action={<Link href={href(group.kind, group.page)} className={buttonClasses('secondary', 'sm')}>Try again</Link>} /> : group.items.length ? <div className="grid gap-4 sm:grid-cols-2">{group.items.map((item) => <EntityCard key={item.id} href={item.href} title={item.title} description={item.summary} />)}</div> : <EmptyState variant="no-results" title="No offerings on this page" description="Start from the first page to see what is available." action={<Link href={href(group.kind, 1)} className={buttonClasses('secondary', 'sm')}>First page</Link>} />}
          {!group.unavailable && group.items.length > 0 && group.total > LEARNING_PAGE_SIZE ? <nav className="flex items-center justify-between gap-4" aria-label={`${LABEL[group.kind]} pages`}>
            {group.page > 1 ? <Link href={href(group.kind, group.page - 1)} className={buttonClasses('secondary', 'sm')}>Previous</Link> : <span />}
            <span className="text-body-sm text-muted">Page {group.page} of {Math.ceil(group.total / LEARNING_PAGE_SIZE)}</span>
            {group.page * LEARNING_PAGE_SIZE < group.total ? <Link href={href(group.kind, group.page + 1)} className={buttonClasses('secondary', 'sm')}>Next</Link> : <span />}
          </nav> : null}
        </section>
      ))}
    </div>
  )
}
