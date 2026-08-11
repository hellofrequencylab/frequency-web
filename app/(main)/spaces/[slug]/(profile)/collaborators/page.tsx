import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { listAcceptedCollaborations } from '@/lib/spaces/collaborations'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'

// THE PUBLIC COLLABORATORS TAB (ADR-799 B1-UI). Lists the businesses that operate together with this
// space, both directions (its collaborators + who it operates under), each linking to their space. The
// identity hero + tab chrome come from the (profile) layout; this is the body. Gated into the nav by
// spaceHasCollaborators, so the tab only appears when there is at least one accepted collaboration.

// Its OWN canonical + title. Without this the tab inherits the Space ROOT's metadata and declares
// itself a duplicate of a page it is not (FINALIZE-PLAN §9.5).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'collaborators',
    label: 'Collaborators',
    describe: (brandName) => `The businesses that operate together with ${brandName}.`,
  })
}

export default async function SpaceCollaboratorsProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const collaborators = await listAcceptedCollaborations(space.id)
  const brandName = space.brandName ?? space.name

  return (
    <div className="space-y-4">
      <div>
        {/* font-section: the page theme's heading face (ADR-578); a computed no-op for `bold`. */}
        <h2 className="font-section text-lead font-bold text-text">Collaborators</h2>
        <p className="text-body-sm text-muted">Businesses that operate together with {brandName}.</p>
      </div>
      {collaborators.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center text-body-sm text-muted">
          No collaborators yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collaborators.map((v) => (
            <Link
              key={v.id}
              href={`/spaces/${v.partner.slug}`}
              className="flex items-center gap-3 rounded-control border border-border bg-surface p-4 transition-colors hover:bg-surface-elevated"
            >
              {v.partner.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator-supplied space logo, not a build asset
                <img src={v.partner.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-body font-bold text-subtle">
                  {v.partner.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-text">{v.partner.name}</p>
                {v.partner.tagline && <p className="truncate text-meta text-subtle">{v.partner.tagline}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
