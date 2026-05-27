// Canonical season ranks — The Field game system.
// Reference: notion.so/36bfb0d4b941810db128cf207401745e
//
// Naming is locked. Do not rename without updating the Notion canonical
// reference and the season_rank_enum migration.

export const SEASON_RANKS = [
  { rank: 'ghost',     label: 'Ghost',     minZaps: 0,    order: 1, color: 'bg-slate-400',   text: 'text-slate-500'   },
  { rank: 'runner',    label: 'Runner',    minZaps: 100,  order: 2, color: 'bg-blue-500',    text: 'text-blue-600'    },
  { rank: 'operative', label: 'Operative', minZaps: 300,  order: 3, color: 'bg-emerald-500', text: 'text-emerald-600' },
  { rank: 'agent',     label: 'Agent',     minZaps: 750,  order: 4, color: 'bg-amber-500',   text: 'text-amber-600'   },
  { rank: 'conduit',   label: 'Conduit',   minZaps: 1500, order: 5, color: 'bg-violet-500',  text: 'text-violet-600'  },
  { rank: 'luminary',  label: 'Luminary',  minZaps: 3000, order: 6, color: 'bg-yellow-500',  text: 'text-yellow-600'  },
] as const

export type SeasonRank = typeof SEASON_RANKS[number]['rank']

export const RANK_LABELS: Record<SeasonRank, string> = {
  ghost:     'Ghost',
  runner:    'Runner',
  operative: 'Operative',
  agent:     'Agent',
  conduit:   'Conduit',
  luminary:  'Luminary',
}

export const RANK_COLORS: Record<SeasonRank, string> = {
  ghost:     'bg-slate-400',
  runner:    'bg-blue-500',
  operative: 'bg-emerald-500',
  agent:     'bg-amber-500',
  conduit:   'bg-violet-500',
  luminary:  'bg-yellow-500',
}

export function getRankDef(rank: SeasonRank) {
  return SEASON_RANKS.find(r => r.rank === rank) ?? SEASON_RANKS[0]
}
