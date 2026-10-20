'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSpaceLayoutRailData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { SpacePageBuilder, spaceBlockAdminHref, type BuilderRailData } from './profile-page-builder'
import { NodePageBuilder } from './node-page-builder'

// THE SPACE PAGE BUILDER SWITCH (E0 task 12b, ADR-1851). Mounts the node page builder when the owner-gated
// rail data carries a node document (it does only while render_path_space_profile is on), and the
// type-keyed builder otherwise. The choice rides the DATA, not a client flag read, so the rail and the
// owner preview (which reads the same flag on the server) cannot disagree for long, and the flag stays
// fail-closed: no node document, no node builder. When the rail bundle supplied no seed this fetches once
// itself, so the builder that mounts is always the one the data names (the type-keyed builder would
// otherwise seed the wrong store).

export function SpacePageBuilderSwitch({ slug, seed }: { slug: string; seed?: BuilderRailData | null }) {
  const [fetched, setFetched] = useState<BuilderRailData | null | undefined>(undefined)
  const load = useCallback(async (): Promise<BuilderRailData | null> => {
    const d = await getSpaceLayoutRailData(slug)
    return d
      ? {
          matchId: d.slug,
          rows: d.rows,
          hidden: d.hidden,
          content: d.content,
          style: d.style,
          customized: d.customized,
          lockedIds: d.lockedIds,
          pickerData: d.pickerData,
          nodeLayout: d.nodeLayout,
        }
      : null
  }, [slug])

  useEffect(() => {
    if (seed !== undefined) return
    let active = true
    load().then((d) => {
      if (active) setFetched(d)
    })
    return () => {
      active = false
    }
  }, [seed, load])

  const effective = seed !== undefined ? seed : fetched
  if (effective === undefined) return <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  if (effective?.nodeLayout) return <NodePageBuilder pageId={slug} loadRailData={load} seed={effective} editHrefFor={(blockId) => spaceBlockAdminHref(slug, blockId)} />
  return <SpacePageBuilder slug={slug} seed={effective} />
}
