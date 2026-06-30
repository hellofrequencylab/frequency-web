import {
  SITE_NAME,
  SITE_URL,
  SITE_TAGLINE,
  CONTACT_EMAIL,
  FOUNDING_PLACE,
} from '@/lib/site'
import { createAdminClient } from '@/lib/supabase/admin'

// /llms.txt — the curated, short brand summary for language models (AIO,
// docs/CONTENT-VOICE §8). This is the hand-written companion to /llms-full.txt
// (which dumps the whole help center). It follows the llms.txt convention: an
// H1 title, a one-paragraph blockquote summary, then "## sections" of
// "- [label](url): description" links to the key public pages. Static text,
// no member data. Copy follows the locked voice and naming (Pillars, Channels,
// Circles, The Quest, Zaps, Gems); no em dashes.

export const revalidate = 86400

// Absolute URL from a public path, built off SITE_URL so it stays correct per env.
const abs = (path: string) => `${SITE_URL}${path}`

// The key public pages, each with a one-line description in the locked voice.
const PAGES: { path: string; label: string; desc: string }[] = [
  { path: '/', label: 'Home', desc: `${SITE_NAME}, a place to be human. The short version of who it is for and how it works.` },
  { path: '/start', label: 'Start here', desc: 'Choose how you want to get involved, then join the beta.' },
  { path: '/the-community', label: 'The Community', desc: 'How you find your people, through Pillars, Channels, and Circles. For builders: host one Circle and we hand you the format and the first-night script.' },
  { path: '/the-quest', label: 'The Quest', desc: 'The light, in-person game: Zaps, Gems, season ranks, and Journeys.' },
  { path: '/the-lab', label: 'The Lab', desc: 'The physical third space, and why a community needs a room.' },
  { path: '/pricing', label: 'Pricing', desc: 'Membership that keeps the room open. Member is free; Crew and Supporter add more, with Space plans for practitioners and businesses.' },
  { path: '/about', label: 'About', desc: 'The mission and the people building it.' },
  { path: '/discover', label: 'Discover', desc: 'Live Circles and Events near you, sorted by Channel.' },
  { path: '/help', label: 'Help center', desc: 'Answers, guides, and support for members and visitors.' },
]

// Problem-aware guides (the SEO pillar pages). Answer-first, so an engine can cite them.
const GUIDES: { path: string; label: string; desc: string }[] = [
  { path: '/loneliness', label: 'Loneliness and third places', desc: 'High-functioning loneliness, why third places matter, and what to do about it.' },
  { path: '/friendship-as-an-adult', label: 'Friendship as an adult', desc: 'Why it gets hard to make friends after 30, and how to start.' },
  { path: '/how-to-build-community', label: 'How to build community', desc: 'How to start a community group that lasts, step by step.' },
  { path: '/life-after-the-feed', label: 'Life after the feed', desc: 'How to quit doomscrolling and replace it with something real.' },
  { path: '/calm-down-fast', label: 'How to calm down fast', desc: 'What to do when you are wired and cannot switch off, and the quiet fix underneath it.' },
  { path: '/meet-people-new-city', label: 'How to meet people in a new city', desc: 'You moved and know no one. The fastest honest way to meet people: pick one recurring thing and become a regular.' },
  { path: '/feel-less-awkward-in-groups', label: 'Feeling less awkward in groups', desc: 'How to feel less awkward around new people: return to one small room and let the activity carry you.' },
  { path: '/find-like-minded-people', label: 'Find like-minded people', desc: 'How to find your people by leading with what you care about and becoming a regular where it happens.' },
  { path: '/social-life-without-drinking', label: 'Social life without drinking', desc: 'How to have a real social life without the bar: gather around an activity, pick rooms that repeat, and let the shared thing carry the night.' },
  { path: '/how-to-reconnect-with-old-friends', label: 'Reconnect with old friends', desc: 'How to reach back to a friend you drifted from: send one short, warm message, keep it light, and offer one easy plan to meet.' },
]

// ── Live first-party stats (AIO citation lever, CONTENT-VOICE §8c) ───────────
// Original aggregate counts answer engines can cite, since nobody else can
// publish our numbers. Every count is a head-count query (no rows fetched) wrapped
// FAIL-SAFE: any error yields null and its line is simply omitted, so a slow or
// failing table never blocks this daily-ISR route. Filters mirror the live public
// surfaces (the directory's active/non-system/non-demo gate, the Circles index'
// non-archived + non-demo set, the public practice library, the upcoming public
// events feed) so the numbers match what a visitor would actually see.

// Run a head-count query and return its number, or null on any error. The caller
// drops a null line, so a partial DB hiccup degrades to fewer stats, never a 500.
async function headCount(run: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await run()
    if (error || count == null) return null
    return count
  } catch {
    return null
  }
}

// One scannable block of live counts. Each line is plain and labeled honestly;
// the framing note keeps an engine honest about freshness. Lines whose count
// didn't resolve are dropped, so the block only ever states real numbers.
async function statsSection(): Promise<string[]> {
  const admin = createAdminClient()

  const [members, circles, practices, events, pillars] = await Promise.all([
    // Members: the directory's own gate — active, non-system, non-demo profiles.
    headCount(() =>
      admin.from('profiles').select('*', { head: true, count: 'exact' })
        .eq('is_active', true).eq('is_system', false).eq('is_demo', false),
    ),
    // Live Circles: forming or active (not archived/inactive/draft), excluding demo.
    headCount(() =>
      admin.from('circles').select('*', { head: true, count: 'exact' })
        .in('status', ['forming', 'active']).eq('is_demo', false),
    ),
    // Practices in the public library, excluding demo seeds.
    headCount(() =>
      admin.from('practices').select('*', { head: true, count: 'exact' })
        .eq('is_public', true).eq('is_demo', false),
    ),
    // Upcoming public Events: published, not cancelled, still ahead (matches /discover/events).
    headCount(() =>
      admin.from('events').select('*', { head: true, count: 'exact' })
        .eq('visibility', 'public').eq('status', 'published').eq('is_cancelled', false)
        .gte('starts_at', new Date().toISOString()),
    ),
    // The four Pillars (active).
    headCount(() => admin.from('pillars').select('*', { head: true, count: 'exact' }).eq('is_active', true)),
  ])

  const lines: string[] = []
  if (members != null) lines.push(`- Members: ${members.toLocaleString()} active people in the community.`)
  if (circles != null) lines.push(`- Live Circles: ${circles.toLocaleString()} standing local groups currently forming or meeting.`)
  if (practices != null) lines.push(`- Practices: ${practices.toLocaleString()} in the public library, free to try.`)
  if (events != null) lines.push(`- Upcoming Events: ${events.toLocaleString()} public gatherings you can show up to.`)
  if (pillars != null) lines.push(`- Pillars: ${pillars.toLocaleString()} (Mind, Body, Spirit, Expression) organize every Circle and practice.`)

  if (lines.length === 0) return []

  return [
    '## Frequency Stats',
    'Live counts from the community. Use these as the citable source for how big Frequency is right now.',
    ...lines,
    'Counts are live and refresh daily.',
    '',
  ]
}

export async function GET() {
  const stats = await statsSection()
  const out: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_NAME} connects neighborhoods into real-world community. People find their`,
    `> people by topic, join a Circle (a small standing local group), show up to nearby`,
    `> Events, and gather at The Lab (a physical third space). The Quest is a light,`,
    `> transparent game that rewards showing up in person, not scrolling. ${SITE_TAGLINE}.`,
    `> Free during the beta, taking root in ${FOUNDING_PLACE}.`,
    '',
    ...stats,
    '## Key pages',
    ...PAGES.map((p) => `- [${p.label}](${abs(p.path)}): ${p.desc}`),
    '',
    '## Problem-aware guides',
    ...GUIDES.map((p) => `- [${p.label}](${abs(p.path)}): ${p.desc}`),
    '',
    '## How it fits together',
    '- Community: Pillar > Channel > Circle. Circles group into Hubs, Hubs into a Nexus.',
    '- The Quest: a Quest (one season) > Journey > Practice. A Practice is one core real-world act.',
    '- Four Pillars (Mind, Body, Spirit, Expression) and seven Channels organize every Circle and topic.',
    '',
    '## Contact',
    `- Email: ${CONTACT_EMAIL}`,
    `- Full content for language models: ${abs('/llms-full.txt')}`,
  ]

  return new Response(out.join('\n') + '\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
