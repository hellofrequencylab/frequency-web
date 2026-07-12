// Email Studio (2026) Phase 3 — the pre-written, THEMED template PRESETS. Each is a fully authored email
// body as an `EntityLayout` (kind `'email'`): a single vertical column of real palette blocks
// (EMAIL_PALETTE_BLOCK_IDS) with authored headlines + copy, a CTA label + placeholder link, and a hero
// image placeholder where it fits. Loading a preset seeds a fresh EmailDoc / campaign draft the operator
// edits before anything is armed.
//
// The copy mirrors the real Frequency beta use cases (see lib/beta/email-templates.ts for the topic set) but
// is authored as BLOCK trees, not flat strings. Every word is written to the NAMING + CONTENT-VOICE canons:
// the "camp counselor you actually respect" voice, plain sentences, proper nouns (Circle, Practice, Channel,
// Founding Member, Founding Business) carry the magic, at most one exclamation point, and NO em dashes. The
// §10 checklist was run on each preset. Pure data (no React / Next / Supabase) so it is trivially testable.
//
// CONSTRAINT the authoring respects: a block id appears AT MOST ONCE per layout (the rows model dedupes ids
// across the whole layout, and `content` is keyed by block id), so each preset uses each palette block a
// single time. Two "paragraph" blocks (`text` + `prose`) and two "heading" blocks (`heading` +
// `displayHeading`) exist for exactly this reason.

import type { EntityLayout, RowDef } from '@/lib/entity-blocks/layout'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'

/** A pre-written email template preset: the camelCase shape the templates lib maps into an `email_templates`
 *  row (minus the DB-owned id / createdBy / timestamps). `blockJson` is the authored email body. */
export interface EmailPreset {
  name: string
  description: string
  category: string
  subject: string
  preheader: string
  blockJson: EntityLayout
}

/** One authored block: its palette id, its content bag, and an optional per-block style bag. */
interface AuthoredBlock {
  id: string
  content: Record<string, unknown>
  style?: BlockStyle
}

/** A placeholder hero photo URL the operator swaps for a real image (kept absolute so the email renderer's
 *  safeUrl keeps it; the send pipeline never ships the placeholder without a review). */
const HERO = 'https://images.frequencylocal.com/email/placeholder-hero.jpg'

/**
 * Build a valid single-column email `EntityLayout` from an ordered list of authored blocks: one 1-column row
 * per block (so the blocks stack top-to-bottom, exactly how the email renderer walks them), a `content` map
 * keyed by block id, and a sparse `style` map. Block ids are unique per preset by construction, so the rows
 * model's global dedupe never drops one. Pure.
 */
function emailLayout(blocks: AuthoredBlock[]): EntityLayout {
  const rows: RowDef[] = blocks.map((b, i) => ({ id: `r${i}`, columns: 1, cells: [[b.id]] }))
  const content: Record<string, Record<string, unknown>> = {}
  const style: Record<string, BlockStyle> = {}
  for (const b of blocks) {
    content[b.id] = b.content
    if (b.style) style[b.id] = b.style
  }
  const layout: EntityLayout = { rows, content }
  if (Object.keys(style).length) layout.style = style
  return layout
}

// ── The presets ─────────────────────────────────────────────────────────────────────────────────────────

/** 1. Announcement — a big single-line headline, the short version, a hero photo, and one clear next step. */
const ANNOUNCEMENT: EmailPreset = {
  name: 'Announcement',
  description: 'A bold, one-headline announcement for a launch or a change. Hero photo, the short version, one clear next step.',
  category: 'Announcement',
  subject: 'Something new just landed on Frequency',
  preheader: 'The short version, and what to do with it. Takes a minute.',
  blockJson: emailLayout([
    {
      id: 'displayHeading',
      content: { text: 'Big news, in one line', font: 'display' },
      style: { align: 'center' },
    },
    {
      id: 'prose',
      content: {
        text: 'We just shipped something you actually asked for. It is live today. No setup, no catch. Open Frequency and it is already there.',
      },
    },
    {
      id: 'image',
      content: { src: HERO, alt: 'A room of people talking at a Frequency meetup', aspect: 'horizontal' },
    },
    {
      id: 'callout',
      content: {
        title: 'What you can do now',
        body: 'Give it a try this week and tell us what breaks. We read every reply.',
        buttonLabel: 'See what changed',
        buttonUrl: 'https://frequencylocal.com/whats-new',
      },
    },
    { id: 'divider', content: {} },
    { id: 'text', content: { text: 'That is the whole update. More soon.' } },
  ]),
}

/** 2. Newsletter / digest — a weekly roundup: a heading, a lead-in, three feature items, and a Circle nudge. */
const NEWSLETTER: EmailPreset = {
  name: 'Newsletter digest',
  description: 'A weekly roundup. A heading, a short lead-in, three highlights, and one way in (start a Circle).',
  category: 'Newsletter',
  subject: 'The Frequency roundup: what happened this week',
  preheader: 'Three things worth your time, and one Circle to join.',
  blockJson: emailLayout([
    { id: 'heading', content: { text: 'This week on Frequency' } },
    {
      id: 'prose',
      content: {
        text: 'A short roundup of what people got up to, and a couple of ways in if you want them.',
      },
    },
    {
      id: 'features',
      content: {
        items: [
          {
            icon: '📅',
            title: 'Events near you',
            text: 'Six new events went up this week. Most are free. Pick one and just show up.',
          },
          {
            icon: '🔥',
            title: 'Streaks worth chasing',
            text: 'A handful of people hit a 30 day Practice streak. Day 1 is the hard part.',
          },
          {
            icon: '👋',
            title: 'New faces',
            text: 'A wave of new members joined your area. Say hi in a thread.',
          },
        ],
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'callout',
      content: {
        title: 'Start a Circle',
        body: 'A Circle is a few friends doing life on purpose. Yours takes about ten minutes to set up.',
        buttonLabel: 'Start a Circle',
        buttonUrl: 'https://frequencylocal.com/circles/new',
      },
    },
    { id: 'text', content: { text: 'See you Thursday.' } },
  ]),
}

/** 3. Event invite — a photo banner with an RSVP, the details grid, a member quote, and a closing RSVP. */
const EVENT_INVITE: EmailPreset = {
  name: 'Event invite',
  description: 'An invite to a meetup. Photo banner with an RSVP, a details grid, a member quote, and a closing button.',
  category: 'Event',
  subject: "You're invited to a Frequency meetup",
  preheader: 'Same time, folding chairs, someone always brings oranges.',
  blockJson: emailLayout([
    {
      id: 'photoHero',
      content: {
        eyebrow: "You're invited",
        title: "Thursday night, and you're on the list",
        subtitle: 'Doors at 7. Come as you are.',
        image: HERO,
        alt: 'People gathered around a table at a Frequency event',
        buttonLabel: 'RSVP',
        buttonUrl: 'https://frequencylocal.com/events/rsvp',
      },
    },
    {
      id: 'editorial',
      content: {
        eyebrow: 'The details',
        title: 'What to expect',
        body: 'A small room, real conversation, and no agenda beyond meeting a few good people. The first five minutes are always a little awkward. Then they are not.',
      },
    },
    {
      id: 'cardGrid',
      content: {
        eyebrow: 'Good to know',
        title: 'Before you come',
        cards: [
          { icon: '🕖', title: 'When', text: 'Thursday, 7 to 9pm.' },
          { icon: '📍', title: 'Where', text: 'The address lands in your RSVP confirmation.' },
          { icon: '🎟️', title: 'Cost', text: 'Free. Bring a friend if you want.' },
        ],
        browseLabel: 'See all events',
        browseUrl: 'https://frequencylocal.com/events',
      },
    },
    {
      id: 'quote',
      content: {
        text: 'I came not knowing anyone and left with plans for the weekend.',
        by: 'A Frequency member',
      },
    },
    {
      id: 'button',
      content: { label: 'RSVP now', url: 'https://frequencylocal.com/events/rsvp', align: 'center' },
    },
  ]),
}

/** 4. Founding-member welcome — a warm welcome, what the status gets you, and a first-week nudge. */
const FOUNDING_MEMBER_WELCOME: EmailPreset = {
  name: 'Founding Member welcome',
  description: 'Welcomes a new Founding Member. What the status locks in, plus a simple first-week nudge.',
  category: 'Onboarding',
  subject: 'Welcome, Founding Member',
  preheader: 'You were here first. Here is what that gets you.',
  blockJson: emailLayout([
    {
      id: 'displayHeading',
      content: { text: 'Welcome in. You were here first.', font: 'display' },
    },
    {
      id: 'prose',
      content: {
        text: 'You joined Frequency before it was easy to explain, and that means something to us. As a Founding Member, a few things are yours for good.',
      },
    },
    {
      id: 'features',
      content: {
        items: [
          {
            icon: '🏷️',
            title: 'The lowest price, locked',
            text: 'You keep the founding rate for as long as you are a member. It never goes up.',
          },
          {
            icon: '🎖️',
            title: 'A founding badge',
            text: 'A small mark on your profile that says you were here at the start.',
          },
          {
            icon: '📣',
            title: 'A direct line',
            text: 'Reply to any of our emails. A real person reads it, and often builds it.',
          },
        ],
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'callout',
      content: {
        title: 'Get your first week going',
        body: 'Pick the Channels you care about, say hi in a thread, and start one Practice. That is plenty for week one.',
        buttonLabel: 'Open Frequency',
        buttonUrl: 'https://frequencylocal.com/home',
      },
    },
    { id: 'text', content: { text: 'Glad you are here. Welcome, from the whole team.' } },
  ]),
}

/** 5. Founding-business invite — a photo banner, the offer, three reasons, a quote, and a claim button. */
const FOUNDING_BUSINESS_INVITE: EmailPreset = {
  name: 'Founding Business invite',
  description: 'Invites a local business to claim a Founding Business Space. Banner, the offer, three reasons, a quote, a CTA.',
  category: 'Business',
  subject: 'Put your business on Frequency as a Founding Business',
  preheader: 'Your own Space, a founding rate, and we set it up with you.',
  blockJson: emailLayout([
    {
      id: 'photoHero',
      content: {
        eyebrow: 'Founding Business',
        title: 'The people here are your neighbors',
        subtitle: 'Give your local business a home on Frequency before this opens up.',
        image: HERO,
        alt: 'A local business owner welcoming people through the door',
        buttonLabel: 'Claim a spot',
        buttonUrl: 'https://frequencylocal.com/business/founding',
      },
    },
    {
      id: 'editorial',
      content: {
        eyebrow: 'What you get',
        title: 'A real home for your business',
        body: 'A Founding Business gets its own Space to post events and offers, a founding badge, and the lowest rate we will ever set, kept for good.',
      },
    },
    {
      id: 'features',
      content: {
        items: [
          {
            icon: '🏠',
            title: 'Your own Space',
            text: 'Post events, offers, and updates the whole community can see.',
          },
          {
            icon: '🤝',
            title: 'We set it up with you',
            text: 'A real person walks you through the whole thing. No dashboard to figure out alone.',
          },
          {
            icon: '💸',
            title: 'The founding rate',
            text: 'The lowest price we will ever set, and you keep it.',
          },
        ],
      },
    },
    {
      id: 'quote',
      content: {
        text: 'Frequency filled my Tuesday class from a single post.',
        by: 'A Founding Business owner',
      },
    },
    {
      id: 'button',
      content: {
        label: 'Claim a Founding Business spot',
        url: 'https://frequencylocal.com/business/founding',
        align: 'center',
      },
    },
  ]),
}

/** 6. Re-engagement — a soft "it has been a minute", three easy ways back, and an open door. No guilt. */
const RE_ENGAGEMENT: EmailPreset = {
  name: 'Re-engagement',
  description: 'A warm, guilt-free nudge for a quiet member. Three easy ways back in, and a door left open.',
  category: 'Re-engagement',
  subject: 'It has been a minute',
  preheader: 'No guilt. Just a door left open, and one easy way back in.',
  blockJson: emailLayout([
    { id: 'heading', content: { text: 'It has been a minute' } },
    {
      id: 'prose',
      content: {
        text: 'You have been quiet lately, and that is completely fine. Life gets loud. The door is still open, and getting back in takes about two minutes.',
      },
    },
    {
      id: 'cardGrid',
      content: {
        eyebrow: 'Three easy ways back',
        title: 'Pick one, that is it',
        cards: [
          { icon: '👋', title: 'Say hi', text: 'Drop one line in a thread. That is a whole comeback.' },
          { icon: '📅', title: 'RSVP to one thing', text: 'One event near you, this week. Just show up.' },
          { icon: '🌱', title: 'Restart a Practice', text: 'Five minutes before coffee counts.' },
        ],
        buttonOn: false,
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'callout',
      content: {
        title: 'Come back when you want',
        body: 'No streak to rebuild, no catching up. Open Frequency and start wherever.',
        buttonLabel: 'Head back in',
        buttonUrl: 'https://frequencylocal.com/home',
      },
    },
    { id: 'text', content: { text: 'We kept your seat. See you when we see you.' } },
  ]),
}

/** 7. Simple text update — a plain, short heads-up: a heading, two paragraphs, and one button. No hero. */
const SIMPLE_UPDATE: EmailPreset = {
  name: 'Simple text update',
  description: 'A plain, short heads-up with no hero image. A heading, a couple of paragraphs, and one button.',
  category: 'Update',
  subject: 'A quick update from Frequency',
  preheader: 'Short one. Two things, then you are done.',
  blockJson: emailLayout([
    { id: 'heading', content: { text: 'A quick update' } },
    {
      id: 'text',
      content: { text: 'Two small things worth a heads up, then you can get back to your day.' },
    },
    {
      id: 'prose',
      content: {
        text: 'First, the Thursday meetups now start at 7 instead of 6:30, so the after-work crowd can make it. Second, we fixed the thing where an RSVP sometimes did not stick. Both are live now.',
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'button',
      content: { label: 'Open Frequency', url: 'https://frequencylocal.com/home', align: 'center' },
    },
  ]),
}

/** Every pre-written email preset, in gallery order. The templates lib seeds any of these not already saved
 *  (matched by name), and the gallery renders them as "Use this" cards. */
export const EMAIL_PRESETS: readonly EmailPreset[] = [
  ANNOUNCEMENT,
  NEWSLETTER,
  EVENT_INVITE,
  FOUNDING_MEMBER_WELCOME,
  FOUNDING_BUSINESS_INVITE,
  RE_ENGAGEMENT,
  SIMPLE_UPDATE,
]

/** A preset by its (unique) name, or null. */
export function emailPresetByName(name: string): EmailPreset | null {
  return EMAIL_PRESETS.find((p) => p.name === name) ?? null
}
