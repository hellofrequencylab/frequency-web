'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { currencyForCriteria, type EngagementCurrency } from '@/lib/engagement/currency'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export interface QuestStepView {
  order: number
  name: string
  description: string
  target: number
  currency: EngagementCurrency
  reward: number
  done: boolean
  current: boolean
}

export interface QuestView {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  reward: number
  currency: EngagementCurrency
  steps: QuestStepView[]
  joined: boolean
  completed: boolean
  progressPct: number
}

export interface QuestPillar {
  slug: string
  name: string
  quests: QuestView[]
}

interface ChainRow {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  zaps_reward: number
  sort_order: number
  domain_id: string | null
  season: number | null
}
interface StepRow {
  chain_id: string
  step_order: number
  name: string
  description: string
  criteria: { type?: string; streak_type?: string } | null
  target: number
  zaps_reward: number
}
interface ProgressRow {
  chain_id: string
  current_step: number
  step_progress: number
  completed_at: string | null
}

// A whole chain pays zaps if any step is a real-life act, else gems (mirrors
// chainCurrency in lib/achievements.ts — kept local to avoid a server import cycle).
function chainCurrencyOf(steps: StepRow[]): EngagementCurrency {
  return steps.some((s) => currencyForCriteria(s.criteria?.type, { streakType: s.criteria?.streak_type }) === 'zaps')
    ? 'zaps'
    : 'gems'
}

/** The seasonal Journeys grouped by Pillar, with the viewer's progress. */
export async function getQuestsData(): Promise<{ pillars: QuestPillar[]; isCrew: boolean }> {
  const caller = await getCallerProfile()
  if (!caller) redirect('/sign-in')
  const isCrew = atLeastRole(caller.community_role, 'crew')

  const admin = createAdminClient()
  const { data: season } = await admin.from('seasons').select('season_number').eq('status', 'active').maybeSingle()
  const activeSeason = (season as { season_number: number } | null)?.season_number ?? null

  const [{ data: chainsRaw }, { data: domains }, { data: progressRaw }] = await Promise.all([
    admin
      .from('quest_chains')
      .select('id, slug, name, description, icon, zaps_reward, sort_order, domain_id, season')
      .order('sort_order'),
    admin.from('domains').select('id, slug, name, display_order').order('display_order'),
    admin.from('quest_progress').select('chain_id, current_step, step_progress, completed_at').eq('profile_id', caller.id),
  ])

  const chains = ((chainsRaw as ChainRow[] | null) ?? []).filter(
    (c) => c.season == null || activeSeason == null || c.season === activeSeason,
  )
  if (chains.length === 0) return { pillars: [], isCrew }

  const { data: stepsRaw } = await admin
    .from('quest_steps')
    .select('chain_id, step_order, name, description, criteria, target, zaps_reward')
    .in('chain_id', chains.map((c) => c.id))
    .order('step_order')

  const stepsByChain = new Map<string, StepRow[]>()
  for (const s of (stepsRaw as StepRow[] | null) ?? []) {
    const list = stepsByChain.get(s.chain_id) ?? []
    list.push(s)
    stepsByChain.set(s.chain_id, list)
  }
  const progressByChain = new Map(((progressRaw as ProgressRow[] | null) ?? []).map((p) => [p.chain_id, p]))

  const domainById = new Map(((domains as { id: string; slug: string; name: string }[] | null) ?? []).map((d) => [d.id, d]))

  const view = (c: ChainRow): QuestView => {
    const steps = stepsByChain.get(c.id) ?? []
    const prog = progressByChain.get(c.id)
    const joined = !!prog
    const completed = !!prog?.completed_at
    const stepViews: QuestStepView[] = steps.map((s) => ({
      order: s.step_order,
      name: s.name,
      description: s.description,
      target: s.target,
      currency: currencyForCriteria(s.criteria?.type, { streakType: s.criteria?.streak_type }),
      reward: s.zaps_reward,
      done: completed || (!!prog && s.step_order < prog.current_step),
      current: !completed && !!prog && s.step_order === prog.current_step,
    }))
    let pct = 0
    if (completed) pct = 100
    else if (prog && steps.length) {
      const cur = steps.find((s) => s.step_order === prog.current_step)
      const frac = cur && cur.target > 0 ? Math.min(1, prog.step_progress / cur.target) : 0
      pct = Math.round(((prog.current_step - 1 + frac) / steps.length) * 100)
    }
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      reward: c.zaps_reward,
      currency: chainCurrencyOf(steps),
      steps: stepViews,
      joined,
      completed,
      progressPct: pct,
    }
  }

  // Group by Pillar (domain display order); un-pillared journeys (micro) last.
  const pillars: QuestPillar[] = []
  const ordered = [...((domains as { id: string; slug: string; name: string }[] | null) ?? [])]
  for (const d of ordered) {
    const quests = chains.filter((c) => c.domain_id === d.id).map(view)
    if (quests.length) pillars.push({ slug: d.slug, name: d.name, quests })
  }
  const extras = chains.filter((c) => !c.domain_id || !domainById.has(c.domain_id)).map(view)
  if (extras.length) pillars.push({ slug: 'bonus', name: 'Bonus journeys', quests: extras })

  return { pillars, isCrew }
}

/** Start (join) a seasonal Journey — free for every member (ADR-150). Idempotent. */
export async function startQuest(chainId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not authenticated')

  const admin = createAdminClient()
  const { data: chain } = await admin.from('quest_chains').select('id').eq('id', chainId).maybeSingle()
  if (!chain) return fail('Journey not found')

  const { error } = await admin
    .from('quest_progress')
    .upsert(
      { profile_id: profileId, chain_id: chainId, current_step: 1, step_progress: 0 },
      { onConflict: 'profile_id,chain_id', ignoreDuplicates: true },
    )
  if (error) return fail(error.message)

  revalidatePath('/crew/quests')
  revalidatePath('/feed', 'layout')
  return ok()
}
