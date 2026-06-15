import type { ReactElement } from 'react'
import { CommunityPulse } from '@/components/widgets/community-pulse'
import { NewestMembers } from '@/components/widgets/newest-members'
import { PopularChannels } from '@/components/widgets/popular-channels'
import { TopCircles } from '@/components/widgets/top-circles'

// Binds each layout-module id (lib/widgets/modules.ts) to its self-fetching RSC. Kept apart
// from the metadata so the editor / actions / resolver never import server components. The
// renderer (components/widgets/page-modules.tsx) looks components up here by id.
type ModuleComponent = () => Promise<ReactElement | null>

const COMPONENTS: Record<string, ModuleComponent> = {
  'community-pulse': CommunityPulse,
  'newest-members': NewestMembers,
  'popular-channels': PopularChannels,
  'top-circles': TopCircles,
}

export function componentFor(id: string): ModuleComponent | undefined {
  return COMPONENTS[id]
}
