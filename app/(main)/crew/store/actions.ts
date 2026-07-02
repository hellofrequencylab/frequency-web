'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { canCashIn, deriveTier } from '@/lib/core/entitlement'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { featureAllowed } from '@/lib/pricing/gates'
import { billingLive } from '@/lib/pricing/settings'
import { classifyRedemption } from '@/lib/store/fulfillment'
import { computeSpendableBalance, fetchGiftsSent } from '@/lib/store/balance'
import { giftGems, type GiftGemsResult } from '@/lib/rewards/gifts'

export async function redeemItem(itemId: string): Promise<ActionResult<{ pending: boolean }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not authenticated')

  const admin = createAdminClient()
  // season_id / expires_at lag the generated Database types (repo pattern: untyped
  // handle until `supabase gen types` is re-run).
  const db = admin

  const [{ data: itemRow }, { data: profile }, { data: spends }, giftsSent] = await Promise.all([
    db.from('store_items')
      .select('id, slug, gem_cost, stock, is_active, metadata, category, season_id, expires_at')
      .eq('id', itemId)
      .maybeSingle(),
    admin.from('profiles')
      .select('id, lifetime_gems, current_season_rank, membership_tier')
      .eq('id', profileId)
      .maybeSingle(),
    admin.from('store_redemptions')
      .select('gems_spent')
      .eq('profile_id', profileId),
    // The Gift Gems sink (ADR-305): Gems sent away also reduce spendable balance.
    fetchGiftsSent(admin, profileId),
  ])
  const item = itemRow as {
    id: string
    slug: string
    gem_cost: number
    stock: number | null
    is_active: boolean
    metadata: Record<string, unknown> | null
    category: string
    season_id: number | null
    expires_at: string | null
  } | null

  if (!item) return fail('Item not found')
  if (!item.is_active) return fail('Item is no longer available')

  // Cash-in is the PAID unlock (ROLES.md §Entitlement; the Vault ✋→✅ gate). Accrual
  // runs for everyone; spending Gems / claiming rewards is gated on the real entitlement
  // column — never the (retired) community role (ADR-207/225). The store UI already mutes
  // the grid for free members (CrewGate), but the server action is the authority, so we
  // enforce it here too and hand back a clean upsell pointing at /upgrade.
  const tier = ((profile as { membership_tier?: EntitlementTier | null } | null)?.membership_tier) ?? 'free'
  if (!canCashIn(tier)) {
    return fail('Cashing in the Vault is a Crew perk. Upgrade at /upgrade to spend your Gems. You keep everything you’ve earned.')
  }
  // Pricing P3: the SAME gate, now also routed through the operator-tunable entitlements layer
  // (featureAllowed) so an operator can adjust the cash-in minimum from /admin/pricing once billing
  // is live. FAIL-SAFE + OFF-PRESERVING: while billing_live is OFF, featureAllowed short-circuits to
  // true, so this is a no-op and today's behavior (the canCashIn line above) is exactly preserved.
  const cashInAllowed = await featureAllowed('vault_cash_in', { tier: deriveTier(tier) }, { billingLive: await billingLive() })
  if (!cashInAllowed) {
    return fail('Cashing in the Vault is a Crew perk. Upgrade at /upgrade to spend your Gems. You keep everything you’ve earned.')
  }

  // Season-exclusive + retiring SKUs (Rewards Economy v2): an S1 item stops
  // selling at season close; expires_at is a hard cutoff.
  if (item.expires_at && new Date(item.expires_at).getTime() < Date.now()) {
    return fail('This item has retired')
  }
  if (item.season_id !== null) {
    const { data: season } = await admin
      .from('seasons')
      .select('season_number')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if ((season?.season_number ?? null) !== item.season_id) {
      return fail('This item was a season exclusive and has retired')
    }
  }

  // Rank-gated SKUs (e.g. Founders' Table requires Conduit or above).
  const requiredRank = (item.metadata as { requires_rank?: string } | null)?.requires_rank
  if (requiredRank) {
    const order = ['ghost', 'initiate', 'adept', 'master']
    const have = order.indexOf((profile?.current_season_rank as string | null) ?? 'ghost')
    if (have < order.indexOf(requiredRank)) {
      return fail(`Requires ${requiredRank.charAt(0).toUpperCase()}${requiredRank.slice(1)} rank or above`)
    }
  }

  // Capped SKUs: stock is the TOTAL sellable count (e.g. 12 Listening Room seats).
  if (item.stock !== null) {
    const { count: sold } = await admin
      .from('store_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId)
    if ((sold ?? 0) >= item.stock) return fail('Out of stock')
  }

  // Spendable balance = gems earned (lifetime) − store spend − gifts sent. lifetime_gems
  // is monotonic; the two sinks (store redemptions + gifted Gems) are what draw it down.
  // ONE shared helper (lib/store/balance) so the store and the Gift sink always agree.
  const balance = computeSpendableBalance({
    lifetimeGems: profile?.lifetime_gems,
    redemptions: spends,
    giftsSent,
  })
  if (balance < item.gem_cost) {
    return fail(`Not enough Gems. You need ${item.gem_cost - balance} more.`)
  }

  // Buy-a-freeze sink (ADR-305): the 'streak-freeze' SKU grants a daily-streak freeze
  // token instead of a cosmetic. Refuse BEFORE charging if the member is already at the
  // reserve cap — don't take Gems for a freeze that can't be banked. The actual grant
  // happens after the store_redemptions row is written below (that row is the debit).
  if (item.slug === 'streak-freeze') {
    const { getPracticeStreak } = await import('@/lib/practice-streak')
    const streak = await getPracticeStreak(profileId)
    if (streak.freezeTokens >= streak.reserveCap) {
      return fail(`You already have the most streak freezes you can hold (${streak.reserveCap}). Your Gems stay safe.`)
    }
  }

  // Check if already purchased (for non-stackable items like cosmetics/titles)
  if (['cosmetic', 'title', 'collectible'].includes(item.category)) {
    const { data: existing } = await admin
      .from('store_redemptions')
      .select('id')
      .eq('profile_id', profileId)
      .eq('item_id', itemId)
      .maybeSingle()

    if (existing) return fail('You already own this item')
  }

  // Fulfillment routing (ADR-280, classifyRedemption) — never charge Gems for something
  // we cannot deliver. Cosmetics apply instantly; operator-honored perks are recorded
  // ({ pending }); a membership BILLING CREDIT (membership-1mo/3mo) is REFUSED because we
  // can't grant it until the Stripe billing-credit rail exists (OPEN-THREADS A3). Those
  // two SKUs are also deactivated in migration 20260627000000; this guards reactivation.
  const plan = classifyRedemption(item.metadata)
  if (plan.kind === 'refuse') {
    return fail('Membership credits aren’t redeemable yet. They unlock when billing credits launch, and your Gems stay safe.')
  }
  const cosmeticType = plan.kind === 'cosmetic' ? plan.cosmeticType : null
  const cosmeticValue = (item.metadata as { value?: string } | null)?.value

  // Charge ATOMICALLY: redeem_store_item_atomic (migration 20260726000000) takes
  // pg_advisory_xact_lock on the buyer, rechecks the spendable balance AND the capped-SKU
  // stock inside the transaction, and inserts the store_redemptions row only if both still
  // hold — closing the check-then-insert overspend/oversell race the two app-side
  // pre-checks above cannot close. The after_store_redemption trigger still fires on the
  // insert (it decrements store_items.stock), so stock handling is unchanged.
  // Untyped handle (same pattern as lib/blocking.ts): redeem_store_item_atomic is new
  // (migration 20260726000000) and not yet in the generated Database types, so we widen to
  // the un-parametrised SupabaseClient. Drop after `supabase gen types` is re-run.
  const rpc: SupabaseClient = createAdminClient()
  const { error } = await rpc.rpc('redeem_store_item_atomic', {
    _profile: profileId,
    _item: itemId,
    _cost: item.gem_cost,
  })

  if (error) {
    // The RPC raises a typed P0001 message; map the two expected ones to clean copy and
    // fail CLOSED on anything else (incl. a missing function) — never a silent overspend.
    if (error.message?.includes('insufficient_balance')) {
      return fail(`Not enough Gems. You need ${item.gem_cost - balance} more.`)
    }
    if (error.message?.includes('out_of_stock')) {
      return fail('Out of stock')
    }
    console.error('[redeemItem] redeem_store_item_atomic failed', error.message)
    return fail('We could not complete that redemption. Your Gems stay safe.')
  }

  // Buy-a-freeze sink (ADR-305): the Gems are now charged (the store_redemptions row
  // above is the debit). Bank the freeze token. The cap was pre-checked before charging;
  // grantStreakFreeze re-checks the cap and is a no-op if it raced to the cap meanwhile.
  if (item.slug === 'streak-freeze') {
    const { grantStreakFreeze } = await import('@/lib/practice-streak')
    await grantStreakFreeze(profileId).catch(() => {})
    // Spending changes the spendable balance shown in the global shell header on EVERY
    // route, so revalidate the root layout — not just /crew — or the stat boxes stay stale.
    revalidatePath('/', 'layout')
    return ok({ pending: false })
  }

  // Cosmetics take effect immediately; everything else is recorded for fulfillment.
  if (cosmeticType === 'border') {
    await admin.from('profiles').update({ profile_border: cosmeticValue }).eq('id', profileId)
  } else if (cosmeticType === 'flair') {
    await admin.from('profiles').update({ profile_flair: cosmeticValue }).eq('id', profileId)
  } else if (cosmeticType === 'title') {
    await admin.from('profiles').update({ custom_title: cosmeticValue }).eq('id', profileId)
  }

  revalidatePath('/crew/store')
  // The spendable Gem balance shows in the global shell header on every route; revalidate
  // the root layout so all the stat boxes update immediately after a spend (not just /crew).
  revalidatePath('/', 'layout')
  return ok({ pending: cosmeticType === null })
}

/**
 * Gift Gems to another member (Vault sink, ADR-305). Thin wrapper: resolves the giver
 * from the session, delegates validation + the spend/credit to lib/rewards/gifts, and
 * revalidates the store so the giver's balance updates. The giver can never gift more
 * than their spendable balance (the gift action validates it with the same shared calc
 * the store uses), and it returns a clean error rather than ever losing Gems.
 */
export async function giftGemsAction(
  toProfileId: string,
  amount: number,
): Promise<ActionResult<GiftGemsResult>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not authenticated')

  const result = await giftGems(profileId, toProfileId, amount)

  revalidatePath('/crew/store')
  // Gifting debits the giver's spendable balance shown site-wide — refresh the shell header.
  revalidatePath('/', 'layout')
  return result
}

export interface GiftRecipient {
  id: string
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

/**
 * Search the members you can gift Gems to. Parameterized `.ilike()` per column
 * (SEC-10: never interpolate user input into a `.or()` filter string — PostgREST
 * parses that for its own operators), excludes yourself and demo/inactive profiles,
 * and returns only public identity fields. Limit 8. Mirrors the vetted
 * searchMembersToLink pattern in connections/actions.ts.
 */
export async function searchGiftRecipients(q: string): Promise<GiftRecipient[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  const term = q.trim()
  if (term.length < 2) return []
  const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const admin = createAdminClient()
  const base = () =>
    admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .eq('is_active', true)
      .eq('is_demo', false)
      .neq('id', profileId)
      .limit(8)
  const [byName, byHandle] = await Promise.all([
    base().ilike('display_name', pattern),
    base().ilike('handle', pattern),
  ])
  type Row = { id: string; display_name: string | null; handle: string | null; avatar_url: string | null }
  const merged = new Map<string, Row>()
  for (const p of [...((byName.data ?? []) as Row[]), ...((byHandle.data ?? []) as Row[])]) {
    if (!merged.has(p.id)) merged.set(p.id, p)
  }
  return [...merged.values()].slice(0, 8).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    handle: p.handle,
    avatarUrl: p.avatar_url,
  }))
}

export async function getStoreData() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const admin = createAdminClient()

  const [{ data: items }, { data: redemptions }, { data: profile }, giftsSent] = await Promise.all([
    admin.from('store_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order'),
    admin.from('store_redemptions')
      .select('item_id, redeemed_at, gems_spent')
      .eq('profile_id', profileId),
    admin.from('profiles')
      .select('lifetime_gems, profile_border, profile_flair, custom_title')
      .eq('id', profileId)
      .maybeSingle(),
    // The Gift Gems sink (ADR-305): gifts sent reduce the spendable balance too.
    fetchGiftsSent(admin, profileId),
  ])

  const ownedIds = new Set((redemptions ?? []).map(r => r.item_id))

  // Hard-expired SKUs drop off the shelf (season-exclusive cutoffs are enforced
  // at redeem time, where the active season is known).
  const now = Date.now()
  const onShelf = (items ?? []).filter((i) => {
    const exp = (i as { expires_at?: string | null }).expires_at
    return !exp || new Date(exp).getTime() >= now
  })

  return {
    items: onShelf.map(item => ({
      ...item,
      owned: ownedIds.has(item.id),
    })),
    // Spendable = earned − store spend − gifts sent (lib/store/balance, the one source).
    balance: computeSpendableBalance({
      lifetimeGems: profile?.lifetime_gems,
      redemptions,
      giftsSent,
    }),
    equipped: {
      border: profile?.profile_border ?? null,
      flair: profile?.profile_flair ?? null,
      title: profile?.custom_title ?? null,
    },
  }
}
