'use client'

import { useCallback, useEffect, useState } from 'react'
import { getMemberLayoutRailData } from '@/app/(main)/settings/rail-getters'
import { MEMBER_CHROME_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { ProfilePageBuilder, type BuilderRailData } from './profile-page-builder'
import { NodePageBuilder } from './node-page-builder'

// THE MEMBER PAGE BUILDER SWITCH (E0 task 12b, LIVE-1063). The member twin of SpacePageBuilderSwitch: mounts the
// node page builder when the owner's rail data carries a node document (it does only while
// render_path_space_profile is on, the profile surface's switch) and the type-keyed builder otherwise. The
// choice rides the DATA, so the flag stays fail-closed: no node document, no node builder.

export function MemberPageBuilderSwitch({ pageHandle }: { pageHandle: string }) {
  const [seed, setSeed] = useState<BuilderRailData | null | undefined>(undefined)
  const load = useCallback(async (): Promise<BuilderRailData | null> => {
    const d = await getMemberLayoutRailData()
    return d
      ? {
          matchId: d.handle,
          rows: d.rows,
          hidden: d.hidden,
          content: d.content,
          style: d.style,
          customized: d.customized,
          lockedIds: [...MEMBER_CHROME_BLOCK_IDS],
          nodeLayout: d.nodeLayout,
        }
      : null
  }, [])

  useEffect(() => {
    let active = true
    load().then((d) => {
      if (active) setSeed(d)
    })
    return () => {
      active = false
    }
  }, [load])

  if (seed === undefined) return <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  if (seed?.nodeLayout) return <NodePageBuilder pageId={pageHandle} kind="member" loadRailData={load} seed={seed} />
  return <ProfilePageBuilder pageHandle={pageHandle} />
}
