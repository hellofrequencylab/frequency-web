import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles, FileText, Radio, Globe } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceManageHref } from '@/lib/spaces/types'
import { listPracticesForSpace } from '@/lib/practices'
import { IndexTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NewSpacePracticeButton } from '@/components/spaces/new-space-practice-button'
import { SpacePracticeRow } from '@/components/spaces/space-practice-row'
import { AuthoringAccessNote } from '@/components/pricing/authoring-access-note'
import { asSpacePlan } from '@/lib/pricing/plans'

// A Space's own Practices manager: build, edit, and stage the practices this Space's members do.
// Owner-gated (managing the Space, not a member tier). Each practice is born a private Draft, can go
// Live to the Space with no review, and can then be submitted to the public Library (paid Crew + staff
// review). Distinct from /practices (the public library) and the members' read on the Space profile.
// No em or en dashes; voice per CONTENT-VOICE §10.

export const metadata: Metadata = { title: 'Practices' }
export const dynamic = 'force-dynamic'

export default async function SpacePracticesManagerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Fail closed on a missing / not-visible space (no existence leak), then gate on MANAGING the space.
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  const brandName = space.brandName ?? space.name
  const practices = await listPracticesForSpace(space.id, 50)

  const drafts = practices.filter((p) => p.status === 'draft').length
  const liveInSpace = practices.filter((p) => p.status === 'approved').length
  const inLibrary = practices.filter((p) => p.is_public).length

  return (
    <IndexTemplate
      eyebrow={brandName}
      title="Practices"
      description="Build the practices your members do, each with its own timer. Drafts stay private until you make them live in your space."
      action={<NewSpacePracticeButton slug={space.slug} />}
    >
      <div className="max-w-4xl space-y-6">
        <Link
          href={spaceManageHref(space.type, space.slug)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" /> Back to manage
        </Link>

        <AuthoringAccessNote kind="practice" paidOwner={asSpacePlan(space.plan) !== 'free'} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard bordered size="sm" icon={Sparkles} label="Practices" value={practices.length} />
          <StatCard bordered size="sm" icon={FileText} label="Drafts" value={drafts} />
          <StatCard bordered size="sm" icon={Radio} label="Live in space" value={liveInSpace} />
          <StatCard bordered size="sm" icon={Globe} label="In library" value={inLibrary} />
        </div>

        {practices.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No practices yet"
            description="Create your first practice for your members. It starts here as a private draft, then you make it live in your space."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {practices.map((p) => (
              <SpacePracticeRow
                key={p.id}
                practice={{
                  id: p.id,
                  title: p.title,
                  slug: p.slug,
                  status: p.status,
                  is_public: p.is_public,
                  icon: p.icon,
                  summary: p.summary,
                }}
                slug={space.slug}
              />
            ))}
          </div>
        )}
      </div>
    </IndexTemplate>
  )
}
