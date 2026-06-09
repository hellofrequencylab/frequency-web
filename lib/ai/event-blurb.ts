// AI "why you'd vibe" blurb (docs/EVENTS-SYSTEM.md §3.2). ONE warm, specific
// sentence telling a viewer why this event might resonate — built ONLY from REAL
// overlap we've already computed: shared circles, how many people they KNOW are
// going, and the event's energy_tag/category vs the viewer's own words.
//
// Haiku (cheap) via completeText; cached per (profile, event, UTC day) in
// event_blurb_cache so we never re-spend on the same pairing twice in a day.
// Read-only. Degrades to null (the caller hides the line) whenever AI is off,
// over budget, fails, or there's no genuine overlap to speak to. NEVER fabricates
// names or attendance — the model is given facts and told to invent nothing.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { completeText } from './complete'
import { MODELS } from './models'
import { aiAvailable, featureOverBudget, recordAiUsage } from './usage'

const FEATURE = 'event-blurb'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

const SYSTEM = `You are Vera, Frequency's warm, grounded guide. A member is browsing events, and you write ONE short sentence telling them why a specific event might be their kind of thing.

Rules — follow exactly:
- Output ONE sentence, max ~22 words. No greeting, no name, no emoji, no quotes, no hashtags.
- Use ONLY the facts you are given. NEVER invent a person's name, a friend, an attendance count, or any detail not in the facts.
- If you are told a number of people the member knows are going, you may reference that count warmly (e.g. "two people from your circles are going") — never name anyone, never imply more than the count given.
- Speak to genuine overlap: a shared circle, the event's energy or theme matching what the member is into. Warm and specific, never salesy, never FOMO, never urgent.
- If the facts are thin, write a calm, honest one-liner about the event's energy or theme. Do not pad with fabricated social proof.`

// Energy tags → a short human phrase, so the model speaks plainly about fit.
const ENERGY_PHRASE: Record<string, string> = {
  grounding: 'a grounding, settling pace',
  high_activation: 'high-energy, activating',
  social: 'social and connective',
  ceremonial: 'ceremonial and intentional',
}

/**
 * One warm sentence on why `profileId` would vibe with `eventId`, or null when
 * AI is unavailable / over budget / there's nothing genuine to say. Cached per
 * (profile, event, UTC day). Read-only — never mutates events or RSVPs.
 */
export async function eventBlurb(profileId: string, eventId: string): Promise<string | null> {
  const client = db()
  const dayKey = utcDayKey()

  // ── Cache read (NULL blurb is a valid "nothing to say today" result) ───────
  try {
    const { data: cached } = await client
      .from('event_blurb_cache')
      .select('blurb')
      .eq('profile_id', profileId)
      .eq('event_id', eventId)
      .eq('day_key', dayKey)
      .maybeSingle()
    if (cached) return (cached as { blurb: string | null }).blurb ?? null
  } catch {
    /* cache miss / unavailable — fall through to compute */
  }

  // Kill switch + per-feature daily budget cap. When off, return null WITHOUT
  // caching (so it can be tried again once AI is back on).
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null

  // ── Gather REAL overlap facts ──────────────────────────────────────────────
  let blurb: string | null = null
  try {
    const [{ data: eventRow }, { data: meRow }] = await Promise.all([
      client.from('events').select('title, category, energy_tag, scope_id, scope_type').eq('id', eventId).maybeSingle(),
      client.from('profiles').select('bio, entity_types').eq('id', profileId).maybeSingle(),
    ])
    const event = eventRow as
      | { title: string | null; category: string | null; energy_tag: string | null; scope_id: string; scope_type: string }
      | null
    if (!event) return null
    const me = meRow as { bio: string | null; entity_types: string[] | null } | null

    // Shared circle: is the event's host circle one the viewer is in?
    let sharedCircleName: string | null = null
    if (event.scope_type === 'circle') {
      const { data: mine } = await client
        .from('memberships')
        .select('circle_id')
        .eq('profile_id', profileId)
        .eq('circle_id', event.scope_id)
        .eq('status', 'active')
        .maybeSingle()
      if (mine) {
        const { data: circle } = await client.from('circles').select('name').eq('id', event.scope_id).maybeSingle()
        sharedCircleName = (circle as { name: string } | null)?.name ?? null
      }
    }

    // How many people the viewer KNOWS (accepted connections) are going — a count,
    // never names. Real attendance only.
    let knownGoingCount = 0
    const { data: friendships } = await client
      .from('friendships')
      .select('user_a_id, user_b_id')
      .eq('status', 'accepted')
      .or(`user_a_id.eq.${profileId},user_b_id.eq.${profileId}`)
    const connectionIds = new Set<string>()
    for (const f of (friendships ?? []) as { user_a_id: string; user_b_id: string }[]) {
      connectionIds.add(f.user_a_id === profileId ? f.user_b_id : f.user_a_id)
    }
    if (connectionIds.size > 0) {
      const { data: going } = await client
        .from('event_rsvps')
        .select('profile_id')
        .eq('event_id', eventId)
        .eq('status', 'going')
        .in('profile_id', [...connectionIds])
      knownGoingCount = (going ?? []).length
    }

    // Build the facts block — only what's true.
    const facts: string[] = []
    facts.push(`Event title: ${event.title ?? '(untitled)'}.`)
    if (event.category) facts.push(`Theme/category: ${event.category}.`)
    if (event.energy_tag) facts.push(`Energy: ${ENERGY_PHRASE[event.energy_tag] ?? event.energy_tag}.`)
    if (sharedCircleName) facts.push(`This is hosted by "${sharedCircleName}", a circle the member is already in.`)
    if (knownGoingCount > 0)
      facts.push(`${knownGoingCount} ${knownGoingCount === 1 ? 'person the member is connected to is' : 'people the member is connected to are'} going (do NOT name anyone).`)
    const interests = (me?.entity_types ?? []).filter(Boolean).slice(0, 6)
    if (interests.length > 0) facts.push(`The member describes themselves as: ${interests.join(', ')}.`)
    if (me?.bio) facts.push(`The member's bio: ${me.bio.slice(0, 240)}`)

    // No genuine overlap at all (no shared circle, no known attendees, no energy/
    // theme, no member context) → don't invent one; cache null for the day.
    const hasOverlap = !!(sharedCircleName || knownGoingCount > 0 || event.energy_tag || event.category)
    if (!hasOverlap) {
      blurb = null
    } else {
      const res = await completeText({
        system: SYSTEM,
        tier: 'haiku',
        maxTokens: 80,
        cacheSystem: true,
        messages: [
          {
            role: 'user',
            content: `Facts about this event and member:\n${facts.join('\n')}\n\nWrite the one-sentence "why you'd vibe" line.`,
          },
        ],
      })
      void recordAiUsage({ feature: FEATURE, model: MODELS.haiku, usage: res.usage, costUsd: res.costUsd, profileId })
      blurb = res.text.trim().replace(/^["']|["']$/g, '') || null
    }
  } catch {
    // AI off mid-call / transient failure: return null, don't poison the cache.
    return null
  }

  // ── Cache the result (including a valid null) for the rest of the UTC day ──
  try {
    await client
      .from('event_blurb_cache')
      .upsert({ profile_id: profileId, event_id: eventId, day_key: dayKey, blurb })
  } catch {
    /* best-effort cache write */
  }
  return blurb
}
