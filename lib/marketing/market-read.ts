// "The Market Read" — the AI marketing operator's first wedge (outbound
// acquisition). It reads LIVE in-app signal, names 2–3 of the market's pain
// points with evidence, and drafts resonant outbound content for each — in the
// brand voice (CREATIVE-PLATFORM: warm, plainspoken; missed / exhale / home;
// never "unlock"/"limited time"). The goal is a magical connection (recognition),
// not an advertisement.
//
// PROTOTYPE NOTE: the synthesis + drafting are DETERMINISTIC for now (same
// pattern as the winback proposer in lib/studio/agent.ts). A live Claude operator
// slots in behind `getMarketRead()` once the AI core (lib/ai/*) lands; the GA
// acquisition + external-listening signals slot into `getInAppSignal()` then too.
// Server-only (uses the admin client).

import { createAdminClient } from '@/lib/supabase/admin'

const DAY = 24 * 60 * 60 * 1000

export type MarketSignal = {
  totalMembers: number
  newThisWeek: number
  newWithoutCircle: number
  quietMembers: number
  engagementThisWeek: number
  engagementPriorWeek: number
  topInterest: { name: string; activeCircles: number } | null
}

export type ContentIdea = {
  channel: 'Social' | 'Ad' | 'Hook'
  hook: string
  body: string
}

export type PainPoint = {
  id: string
  title: string
  /** The felt truth, first-person — what the market is actually aching. */
  ache: string
  /** Evidence from live signal (real numbers) or the persona baseline. */
  evidence: string
  /** 'live' = backed by current signal; 'baseline' = persona research only. */
  basis: 'live' | 'baseline'
  persona: string
  ideas: ContentIdea[]
}

export type MarketRead = {
  signal: MarketSignal
  painPoints: PainPoint[]
  generatedAt: string
}

// ── 1. Listen: a real in-app signal snapshot ──────────────────────────────────

async function getInAppSignal(): Promise<MarketSignal> {
  const admin = createAdminClient()
  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY).toISOString()
  const twoWeeksAgo = new Date(now - 14 * DAY).toISOString()

  const [totalRes, newRes, quietRes, engWeekRes, engPriorRes, circlesRes] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true })
      .eq('is_active', true).not('is_system', 'is', true),
    admin.from('profiles').select('id')
      .eq('is_active', true).not('is_system', 'is', true).gte('created_at', weekAgo),
    admin.from('profiles').select('id', { count: 'exact', head: true })
      .eq('is_active', true).not('is_system', 'is', true).lt('last_seen_at', twoWeeksAgo),
    admin.from('engagement_events').select('id', { count: 'exact', head: true })
      .gte('created_at', weekAgo),
    admin.from('engagement_events').select('id', { count: 'exact', head: true })
      .gte('created_at', twoWeeksAgo).lt('created_at', weekAgo),
    admin.from('circles').select('topical_channel_id').eq('status', 'active'),
  ])

  // New members this week who haven't found a circle yet (the activation gap).
  const newIds = (newRes.data ?? []).map((p) => p.id as string)
  let newWithoutCircle = 0
  if (newIds.length > 0) {
    const { data: withCircle } = await admin.from('memberships')
      .select('profile_id').eq('status', 'active').in('profile_id', newIds)
    const haveCircle = new Set((withCircle ?? []).map((m) => m.profile_id as string))
    newWithoutCircle = newIds.filter((id) => !haveCircle.has(id)).length
  }

  // The interest that's most alive (most active circles).
  const byChannel: Record<string, number> = {}
  for (const c of (circlesRes.data ?? []) as { topical_channel_id: string | null }[]) {
    if (c.topical_channel_id) byChannel[c.topical_channel_id] = (byChannel[c.topical_channel_id] ?? 0) + 1
  }
  let topInterest: MarketSignal['topInterest'] = null
  const topId = Object.entries(byChannel).sort((a, b) => b[1] - a[1])[0]
  if (topId) {
    const { data: ch } = await admin.from('topical_channels').select('name').eq('id', topId[0]).maybeSingle()
    if (ch?.name) topInterest = { name: ch.name as string, activeCircles: topId[1] }
  }

  return {
    totalMembers: totalRes.count ?? 0,
    newThisWeek: newIds.length,
    newWithoutCircle,
    quietMembers: quietRes.count ?? 0,
    engagementThisWeek: engWeekRes.count ?? 0,
    engagementPriorWeek: engPriorRes.count ?? 0,
    topInterest,
  }
}

// ── 2 + 3. Read the ache + draft resonant outbound content ────────────────────
// Deterministic for now. Each pain point pulls live evidence when the signal is
// there, and falls back to the persona baseline (CREATIVE-PLATFORM) when it isn't,
// so the read is always populated and on-brand.

function synthesize(signal: MarketSignal): PainPoint[] {
  const { newThisWeek, newWithoutCircle, quietMembers, topInterest } = signal

  const activationGap: PainPoint = {
    id: 'activation-gap',
    title: 'The activation ache',
    ache: 'I signed up to belong — and I’m still on the outside, looking in.',
    basis: newWithoutCircle > 0 ? 'live' : 'baseline',
    evidence: newWithoutCircle > 0
      ? `${newWithoutCircle} of ${newThisWeek} people who joined this week haven’t found a circle yet — the gap between signing up and being seen.`
      : 'Baseline: the High-Functioning Lonely join hopeful, then stall at the threshold of a real room.',
    persona: 'The High-Functioning Lonely',
    ideas: [
      { channel: 'Social', hook: 'You can be in a room full of people and still drive home alone on a Friday.',
        body: 'Frequency isn’t another feed. It’s a few people, near you, who’d notice if you didn’t show up. Come find your circle.' },
      { channel: 'Ad', hook: 'Connected to everything. Close to no one?',
        body: 'A standing place, a standing time, a handful of people who learn your name. Free to start. Leave anytime.' },
      { channel: 'Hook', hook: 'Not another app to check. A room to be missed in.', body: '' },
    ],
  }

  const unmissed: PainPoint = {
    id: 'the-unmissed',
    title: 'The unmissed',
    ache: 'I showed up once. No one noticed when I stopped.',
    basis: quietMembers > 0 ? 'live' : 'baseline',
    evidence: quietMembers > 0
      ? `${quietMembers} members have gone quiet — here, but unseen. The ache we sell is being missed; the wider market feels it before they ever arrive.`
      : 'Baseline: the deepest fear isn’t being disliked — it’s being absent and unnoticed.',
    persona: 'All three personas',
    ideas: [
      { channel: 'Social', hook: 'The opposite of lonely isn’t “a lot of friends.” It’s being missed when you’re gone.',
        body: 'Small circles, on purpose. A place where your absence registers — and your return is noticed.' },
      { channel: 'Ad', hook: 'When did anyone last text you “you ok?” just because you went quiet?',
        body: 'That’s the whole idea. A few people near you, paying attention. Come be one of them.' },
      { channel: 'Hook', hook: 'A place to be missed.', body: '' },
    ],
  }

  const alive: PainPoint = {
    id: 'whats-alive',
    title: 'What’s already alive',
    ache: 'I want in on something real and early — not a Discord that dies in three weeks.',
    basis: topInterest ? 'live' : 'baseline',
    evidence: topInterest
      ? `${topInterest.name} is your most-alive interest right now (${topInterest.activeCircles} active circle${topInterest.activeCircles === 1 ? '' : 's'}). Lead acquisition with the thing already gathering people.`
      : 'Baseline: the Post-Screen Skeptic acts when it’s framed as a movement they get in on early.',
    persona: 'The Post-Screen Skeptic',
    ideas: [
      { channel: 'Social', hook: topInterest ? `${topInterest.name} is taking root near you — in person, off the phone.` : 'Something real is taking root near you — in person, off the phone.',
        body: 'The first circles are forming now. Get in early, shape it from day one, be one of the first through the door.' },
      { channel: 'Ad', hook: 'Run clubs. Bathhouses. Breathwork. People are paying real money to get off the feed and into a body.',
        body: 'Frequency is that — local, device-light, pay-it-forward. Be one of the founders, not a follower.' },
      { channel: 'Hook', hook: 'Get in early on the room, not the app.', body: '' },
    ],
  }

  return [activationGap, unmissed, alive]
}

/** The operator's read of the market, right now. */
export async function getMarketRead(): Promise<MarketRead> {
  const signal = await getInAppSignal()
  return { signal, painPoints: synthesize(signal), generatedAt: new Date().toISOString() }
}
