// Shared, request-cached Vault data (ADR-270/294). The Vault page is module-driven, so its blocks
// each self-fetch — but they all need the same core read (profile + store + season + access). One
// React.cache()'d loader gives every Vault module a single shared fetch per request instead of N.
// Server-only.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getStoreData } from '@/app/(main)/crew/store/actions'
import { journeysFinishedThisSeason, rankForCompletion, type SeasonRank } from '@/lib/season-ranks'
import { getCurrentSeason } from '@/lib/seasons'
import { surfaceAccess } from '@/lib/core/viewer-hats'

type StoreData = Awaited<ReturnType<typeof getStoreData>>

export interface VaultData {
  profileId: string | null
  zaps: number
  streak: number
  seasonRank: SeasonRank | null
  amplitude: number
  rank: SeasonRank
  finished: number
  seasonName: string | undefined
  seasonNumber: number | null
  items: StoreData['items']
  balance: StoreData['balance']
  equipped: StoreData['equipped']
  /** Whether the viewer can actually spend Gems (the paid Vault unlock). */
  canSpend: boolean
}

export const getVaultData = cache(async (): Promise<VaultData | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: prof } = await supabase
    .from('profiles')
    .select('id, current_season_zaps, current_season_rank, current_streak, amplitude')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const p = prof as {
    id: string
    current_season_zaps: number | null
    current_season_rank: SeasonRank | null
    current_streak: number | null
    amplitude: number | null
  } | null
  const profileId = p?.id ?? null

  const [store, finished, season, access] = await Promise.all([
    getStoreData(),
    profileId ? journeysFinishedThisSeason(profileId) : Promise.resolve(0),
    getCurrentSeason(),
    surfaceAccess('vault'),
  ])

  return {
    profileId,
    zaps: p?.current_season_zaps ?? 0,
    streak: p?.current_streak ?? 0,
    seasonRank: p?.current_season_rank ?? null,
    amplitude: Number(p?.amplitude ?? 0),
    rank: rankForCompletion(finished),
    finished,
    seasonName: season?.name ?? undefined,
    seasonNumber: season?.season_number ?? null,
    items: store.items,
    balance: store.balance,
    equipped: store.equipped,
    canSpend: access === 'full',
  }
})
