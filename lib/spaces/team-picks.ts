import type { Data } from '@/lib/page-editor/types'
import { resolveMemberCards, type SpaceTeamMember } from '@/lib/spaces/content-data'

// Resolve the Team block's NETWORK member picks for a page doc, ONCE per render. A SpaceTeam block
// stores an ordered list of chosen member ids (member-picker-field.tsx); the render paths
// (space-landing.tsx, sites/[slug], the editor preview) call this to pre-resolve every picked id across
// the doc into a live card map keyed by profile id, injected under `metadata.space.teamPicks`. Each
// team card then links to `/people/<handle>` without a per-block await. FAIL-SAFE throughout.

/** Collect every network member id chosen in a SpaceTeam block across the doc (top-level blocks plus
 *  SpaceLayout main / side slots). Pure + tolerant: unknown shapes contribute nothing. */
export function collectTeamMemberIds(data: Data): string[] {
  const ids: string[] = []
  const fromBlock = (b: unknown): void => {
    const block = b as { type?: unknown; props?: Record<string, unknown> } | null
    if (!block || typeof block.type !== 'string') return
    if (block.type === 'SpaceTeam') {
      const picked = (block.props?.memberPicks as { ids?: unknown })?.ids
      if (Array.isArray(picked)) for (const id of picked) if (typeof id === 'string') ids.push(id)
    }
    if (block.type === 'SpaceLayout') {
      const props = block.props ?? {}
      for (const slot of [props.main, props.side]) if (Array.isArray(slot)) slot.forEach(fromBlock)
    }
  }
  ;(data.content ?? []).forEach(fromBlock)
  return ids
}

/** The picked-member lookup for a doc (id → live card), or undefined when the doc picks no members (so
 *  the caller skips the extra query). */
export async function resolveTeamPicksForDoc(
  data: Data,
): Promise<Record<string, SpaceTeamMember> | undefined> {
  const ids = collectTeamMemberIds(data)
  if (ids.length === 0) return undefined
  const cards = await resolveMemberCards(ids)
  if (cards.length === 0) return undefined
  return Object.fromEntries(cards.map((c): [string, SpaceTeamMember] => [c.profileId, c]))
}
