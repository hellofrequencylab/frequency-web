'use client'

import { usePathname } from 'next/navigation'
import { getSpaceBasicsData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpaceInfoConnectForm } from '@/components/spaces/space-business-info-form'
import { RailModuleLoading } from './rail-module-loading'
import { useSpaceRailSlice } from './space-rail-data'

// SPACE INFO & CONNECT — Section 2 of the standardized rail (ADR-535). Reads the Space slug from the live
// path, calls the read-gated getSpaceBasicsData(slug) on mount, and renders the SpaceInfoConnectForm inline:
// the forward-facing marketing + connect content (About, Story, contact, links). Name + tagline live in
// Identity & Branding; ratings + visibility live in Settings. The getter re-gates server-side and returns
// null when the viewer cannot manage this Space (fail-safe). The form's own actions re-check canEditProfile.
//
// No module header: the rail already labels this group "Info & Connect" (SPACE_GROUP_META).

function slugFromPath(pathname: string): string | null {
  return pathname.match(/^\/spaces\/([^/]+)/)?.[1] ?? null
}

export function SpaceBasicsModule() {
  const pathname = usePathname()
  const slug = slugFromPath(pathname)

  // Read this module's slice from the shared rail bundle (ADR-550), falling back to its own getter when
  // mounted outside the rail. The bundle re-gates identically, so the fail-safe (null → no chrome) holds.
  const { data, loading } = useSpaceRailSlice(slug, (b) => b.basics, getSpaceBasicsData)

  if (!slug) return null
  if (loading) return <RailModuleLoading />
  if (!data) return null // not permitted / not found → no chrome

  return (
    <section className="min-w-0">
      <SpaceInfoConnectForm
        spaceId={data.spaceId}
        slug={data.slug}
        about={data.initial.about}
        business={data.business}
        readOnly={data.readOnly}
      />
    </section>
  )
}
