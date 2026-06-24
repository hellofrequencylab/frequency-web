import {
  SITE_NAME,
  SITE_URL,
  SITE_TAGLINE,
  CONTACT_EMAIL,
  FOUNDING_PLACE,
} from '@/lib/site'

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
]

export async function GET() {
  const out: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_NAME} connects neighborhoods into real-world community. People find their`,
    `> people by topic, join a Circle (a small standing local group), show up to nearby`,
    `> Events, and gather at The Lab (a physical third space). The Quest is a light,`,
    `> transparent game that rewards showing up in person, not scrolling. ${SITE_TAGLINE}.`,
    `> Free during the beta, taking root in ${FOUNDING_PLACE}.`,
    '',
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
