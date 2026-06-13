// Quests — the read layer for The Quest → Quest (season) → Journeys →
// Practices hierarchy (ADR-152). A Quest is a season's official, free container of
// Journeys; each Journey (journey_plans, official + quest_id set) is a set of
// practices. The surfaces render Quests → their Journeys → (the existing Journey
// detail shows practices). Everything is free.
//
// Read through an UNTYPED handle: the `quests` table + `journey_plans.quest_id` /
// `official` columns aren't in the generated types yet (cast pattern per
// lib/practice-streak.ts). Defensive — if the B1 migration hasn't been applied
// (table/columns absent), every read returns empty so the page degrades to an
// empty state instead of throwing.

import { createAdminClient } from '@/lib/supabase/admin'

export interface QuestJourneyCard {
  slug: string
  title: string
  emoji: string | null
  accent: string | null
  practiceCount: number
}

export interface SeasonalQuestView {
  id: string
  slug: string
  name: string
  description: string | null
  emoji: string | null
  accent: string | null
  journeys: QuestJourneyCard[]
}

interface QuestRow {
  id: string
  slug: string
  name: string
  description: string | null
  emoji: string | null
  accent: string | null
}

interface JourneyRow {
  slug: string
  title: string
  emoji: string | null
  accent: string | null
  quest_id: string
  journey_plan_items: { count: number }[] | null
}

/** Active Quests, each with its official Journeys (slug/title/identity +
 *  practice count). Empty array if the B1 migration isn't applied yet. */
export async function getSeasonalQuests(): Promise<SeasonalQuestView[]> {
  const db = createAdminClient()
  try {
    const { data: questData, error } = await db
      .from('quests')
      .select('id, slug, name, description, emoji, accent, sort_order')
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
    if (error || !questData) return []
    const quests = questData as QuestRow[]
    if (quests.length === 0) return []

    const { data: journeyData } = await db
      .from('journey_plans')
      .select('slug, title, emoji, accent, quest_id, journey_plan_items(count)')
      .in('quest_id', quests.map((q) => q.id))
      .eq('official', true)
      .order('created_at', { ascending: true })
    const journeys = (journeyData ?? []) as JourneyRow[]

    const byQuest = new Map<string, QuestJourneyCard[]>()
    for (const j of journeys) {
      const practiceCount = Array.isArray(j.journey_plan_items)
        ? (j.journey_plan_items[0]?.count ?? 0)
        : 0
      const arr = byQuest.get(j.quest_id) ?? []
      arr.push({ slug: j.slug, title: j.title, emoji: j.emoji, accent: j.accent, practiceCount })
      byQuest.set(j.quest_id, arr)
    }

    return quests.map((q) => ({
      id: q.id,
      slug: q.slug,
      name: q.name,
      description: q.description,
      emoji: q.emoji,
      accent: q.accent,
      journeys: byQuest.get(q.id) ?? [],
    }))
  } catch {
    return []
  }
}
