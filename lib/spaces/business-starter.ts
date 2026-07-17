// BUSINESS QUICK-START starter content (pure, framework-free, unit-testable). Given the four things a
// new business owner drops in the quick-start wizard (name, what-you-do, website, Instagram, Facebook),
// this builds the SEED a fresh business Space lands with: a warm cover photo from the Frequency Loom, the
// owner's real links, and — for every content block — a PROMPT written TO them that leads them into
// writing good copy in their own voice. It never writes their copy FOR them; the prompts are gentle
// placeholders the owner replaces. The Space is created PRIVATE, so these prompts are for the owner's eyes
// while they fill the page in, never the public. Voice canon: plain, encouraging, no em dashes.

import type { SpaceProfileData, SpaceSocialLink } from './profile-data'

/** The handful of fields the quick-start collects. Everything except name/whatYouDo is optional. */
export interface BusinessIntake {
  /** The business / space name. */
  name: string
  /** The owner's own answer to "what do you do?" — the single seed the prompts personalize from. */
  whatYouDo: string
  website?: string
  instagram?: string
  facebook?: string
}

/** Everything the provisioning step writes onto the new Space so it opens feeling like theirs. */
export interface BusinessStarter {
  /** spaces.tagline — the one-line identity hook (a prompt until they replace it). */
  tagline: string
  /** spaces.about — the SHORT about intro block (a personalized prompt). */
  aboutShort: string
  /** spaces.cover_image_url — a warm Frequency Loom banner so the page is never blank. */
  coverImageUrl: string
  /** preferences.profileData — the owner's real links + the story prompt (the About/story body). */
  profileData: SpaceProfileData
}

// Warm, human Frequency Loom banners (public/images/site). Deterministically chosen per business so two
// new spaces do not always get the same photo, without any randomness (which the workflow env forbids).
const LOOM_COVERS = [
  '/images/site/breathwork-circle.jpg',
  '/images/site/outdoor-yoga.jpg',
  '/images/site/song-circle.jpg',
  '/images/site/community-1.jpg',
  '/images/site/meditation-circle-outdoor.jpg',
  '/images/site/hula-hoop-beach.jpg',
  '/images/site/adult-play.jpg',
  '/images/site/yoga-in-the-grass.jpg',
] as const

/** Pick a Loom cover deterministically from the name (stable char-sum, no randomness). */
export function pickLoomCover(name: string): string {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum = (sum + name.charCodeAt(i)) % 100000
  return LOOM_COVERS[sum % LOOM_COVERS.length]
}

/** Turn a handle or URL into a full profile URL for a platform. Accepts `@name`, `name`, or a full URL. */
function socialUrl(base: string, raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@+/, '').replace(/\/+$/, '').trim()
  if (!handle) return null
  return `${base}/${handle}`
}

/** Normalize a website input to an https URL, or null when blank / unusable. */
function websiteUrl(raw?: string): string | undefined {
  const v = (raw ?? '').trim()
  if (!v) return undefined
  if (/^https?:\/\//i.test(v)) return v
  if (v.includes('.')) return `https://${v}`
  return undefined
}

/**
 * Build the full starter seed for a new business Space. PURE + total: trims/normalizes the intake,
 * personalizes each prompt from `whatYouDo`, attaches only the links the owner actually gave, and picks a
 * deterministic cover. Never invents facts or writes finished copy.
 */
export function buildBusinessStarter(intake: BusinessIntake): BusinessStarter {
  const name = intake.name.trim() || 'your space'
  const does = intake.whatYouDo.trim()
  const doesLine = does ? `You told us: "${does}."` : ''

  const tagline = does
    ? `Your one-line hook goes here. ${doesLine} Say it in a few words someone would repeat to a friend.`
    : 'Your one-line hook goes here. In a few words, what you do and who it is for.'

  const aboutShort = does
    ? `${doesLine} Turn that into a warm welcome, in 1 to 2 sentences. Who is ${name} for, and what will they find here? Write it like you are talking to one person, not a crowd.`
    : `Write a warm 1 to 2 sentence welcome. Who is ${name} for, and what will they find here? Talk to one person, not a crowd.`

  const story = does
    ? `This is your story. What led you to ${does.toLowerCase().startsWith('i ') ? does.slice(2) : does}? What do people feel when they are with you, and what changes for them? A few short paragraphs in your own voice beat anything polished. Delete this prompt and write yours.`
    : `This is your story. What led you here, what do people feel when they are with you, and what changes for them? A few short paragraphs in your own voice beat anything polished. Delete this prompt and write yours.`

  const socials: SpaceSocialLink[] = []
  const ig = intake.instagram ? socialUrl('https://instagram.com', intake.instagram) : null
  if (ig) socials.push({ platform: 'instagram', url: ig })
  const fb = intake.facebook ? socialUrl('https://facebook.com', intake.facebook) : null
  if (fb) socials.push({ platform: 'facebook', url: fb })

  const profileData: SpaceProfileData = { about: story }
  const web = websiteUrl(intake.website)
  if (web) profileData.website = web
  if (socials.length > 0) profileData.socials = socials

  return { tagline, aboutShort, coverImageUrl: pickLoomCover(name), profileData }
}
