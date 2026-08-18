// Beta Command Center — the 7 BETA LAUNCH EMAILS, authored as THEMED block layouts (Email Studio, 2026).
//
// The launch arc's copy already lives as plain-text bodies in `./email-templates.ts` (BETA_CAMPAIGN_TEMPLATES
// + BETA_NURTURE_TEMPLATES). That copy is written, canon-checked, and on-voice, but a flat string opens in the
// Studio as an empty editor. THIS module re-authors the SAME sentences as `EntityLayout` block trees (kind
// `'email'`) so each email opens fully designed in the WYSIWYG editor and shows as a themed, editable card in
// the Studio's left rail. It reuses `emailLayout([...])` from lib/email-studio/presets.ts (the ONE authoring
// helper) so the offer and the renderer never drift.
//
// AUTHORING RULES (mirrors presets.ts): every block id is in EMAIL_PALETTE_BLOCK_IDS, and a block id appears
// AT MOST ONCE per layout (the rows model dedupes ids globally, so `heading`/`displayHeading` and
// `text`/`prose` exist precisely so an email can carry two of each). The written SENTENCES are kept EXACTLY as
// the source `body` — this is ARRANGING canon copy into blocks, not rewriting it. Every NEW word (a section
// heading, an eyebrow, a preheader) is on the NAMING + CONTENT-VOICE canons: plain sentences, proper nouns
// (Circle, Practice, Channel, Founding Member, Founding Business) carry the magic, and NO em / en dashes.
//
// PURE (types + data only, no React / Next / Supabase), so it is trivially testable and safe to import
// anywhere. The server seeding path that writes these into `campaigns` lives in `./email-templates.ts`.

import { emailLayout } from '@/lib/email-studio/presets'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import type { SegmentKey } from '@/lib/studio/campaigns'

/** A placeholder hero photo the operator swaps for a real image before anything is armed (absolute so the
 *  email renderer's safeUrl keeps it; the send pipeline never ships the placeholder without a review). */
const HERO = 'https://images.frequencylocal.com/email/placeholder-hero.jpg'

/** One themed beta launch email: the source template's identity + a fully authored `EntityLayout` body. The
 *  seeder (`seedBetaLaunchEmails`) maps this into a `campaigns` row with `block_json` = `blockJson`. */
export interface BetaLaunchEmail {
  key: string
  /** Human label for the seed report + the Studio rail. */
  label: string
  /** The Beta phase (by key) this email belongs to (resolved to phase_id at seed time). */
  phaseKey: string
  subject: string
  /** The inbox preview line (plain, on-voice, no dashes). */
  preheader: string
  segment: SegmentKey
  /** The authored, themed email body as an email-kind `EntityLayout`. */
  blockJson: EntityLayout
}

// ── 1. Waitlist double opt-in confirm (P0) ────────────────────────────────────────────────────────────────
const WAITLIST_CONFIRM: BetaLaunchEmail = {
  key: 'waitlist_confirm',
  label: 'Waitlist double opt-in confirm',
  phaseKey: 'P0',
  segment: 'beta_waitlist',
  subject: 'Confirm your spot on the Frequency waitlist',
  preheader: 'One quick step and your waitlist spot is locked in.',
  blockJson: emailLayout([
    { id: 'heading', content: { text: 'Confirm your spot' } },
    {
      id: 'prose',
      content: {
        text: 'Hi,\n\nYou asked about the Frequency Beta. Good news: it is open, so there is nothing to wait for. Tap below and pick your Circle.',
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'button',
      content: { label: 'Start a Circle', url: 'https://frequencylocal.com/onboarding/beta', align: 'center' },
    },
    {
      id: 'text',
      content: {
        text: 'Join one that is already meeting near you, or start the first one where you live. Free for the whole beta, no card.\n\nIf you did not ask for this, you can ignore this email and nothing happens.\n\nSee you soon,\nThe Frequency team',
      },
    },
  ]),
}

// ── 2. Wave nurture, "you're up soon" (P1) ────────────────────────────────────────────────────────────────
const WAVE_SOON: BetaLaunchEmail = {
  key: 'wave_soon',
  label: 'Wave nurture ("you\'re up soon")',
  phaseKey: 'P1',
  segment: 'beta_waitlist',
  subject: "You're near the front of the line",
  preheader: 'Your area is almost ready and your invite is coming soon.',
  blockJson: emailLayout([
    { id: 'heading', content: { text: "You're near the front of the line" } },
    {
      id: 'prose',
      content: {
        text: 'Hi,\n\nQuick update: your area is almost ready, so your invite is coming soon. Nothing you need to do yet.',
      },
    },
    {
      id: 'text',
      content: {
        text: 'When it lands, you will get a link to create your account and see who is already there. We are keeping the first waves small on purpose, so people arrive to a room with life in it, not an empty one.\n\nHang tight. We will be in touch shortly.\n\nThe Frequency team',
      },
    },
  ]),
}

// ── 3. Beta invite, "you're in" (P1) ──────────────────────────────────────────────────────────────────────
const INVITE: BetaLaunchEmail = {
  key: 'invite',
  label: "You're in (Beta invite)",
  phaseKey: 'P1',
  segment: 'beta_waitlist',
  subject: "You're in. Here's your invite to Frequency",
  preheader: 'Your wave is up. Create your account and meet the people near you.',
  blockJson: emailLayout([
    {
      id: 'photoHero',
      content: {
        eyebrow: "You're invited",
        title: 'Your wave is up',
        subtitle: "You're invited to create your Frequency account and join the community near you.",
        image: HERO,
        alt: 'People talking at a Frequency meetup',
        buttonLabel: 'Create my account',
        buttonUrl: 'https://frequencylocal.com/onboarding/beta',
      },
    },
    { id: 'heading', content: { text: "Here's what to do first" } },
    {
      id: 'features',
      content: {
        items: [
          { icon: '📻', title: 'Pick your Channels', text: 'Pick the Channels you actually care about.' },
          { icon: '👋', title: 'Say hi', text: 'Say hi in a thread, or RSVP to one event.' },
          {
            icon: '🌱',
            title: 'Start a Practice',
            text: 'Start a Practice, or join one a few other people are already doing.',
          },
        ],
      },
    },
    {
      id: 'text',
      content: { text: "That's plenty for week one. We're around if you get stuck.\n\nWelcome,\nThe Frequency team" },
    },
  ]),
}

// ── 4. Founding Member offer (P2) ─────────────────────────────────────────────────────────────────────────
const FOUNDING_MEMBER: BetaLaunchEmail = {
  key: 'founding_member',
  label: 'Founding Member offer',
  phaseKey: 'P2',
  segment: 'members',
  subject: 'Become a Founding Member of Frequency',
  preheader: 'Lock in the lowest price we will ever set, kept for good.',
  blockJson: emailLayout([
    {
      id: 'photoHero',
      content: {
        eyebrow: 'Founding Member',
        title: 'Become a Founding Member',
        subtitle: 'An offer for the people who were here first.',
        image: HERO,
        alt: 'A Frequency member at an early meetup',
        buttonLabel: 'Become a Founding Member',
        buttonUrl: 'https://frequencylocal.com/pricing',
      },
    },
    {
      id: 'prose',
      content: {
        text: "Hi,\n\nYou've been here since the early days, so we want to offer you something before it opens to everyone: Founding Member status.",
      },
    },
    {
      id: 'editorial',
      content: {
        eyebrow: 'What you lock in',
        title: 'The lowest price, for good',
        body: 'Founding Members lock in the lowest price we will ever set and keep it for good. Take the year before September 1 and you also get the founding badge on your profile, plus a direct line to shape what we build next.',
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'callout',
      content: {
        title: 'Only for the Beta group',
        body: 'This is for the Beta group only, and it closes when the Beta does. No pressure. If the timing is not right, you can join later at the regular price.',
        buttonLabel: 'Become a Founding Member',
        buttonUrl: 'https://frequencylocal.com/pricing',
      },
    },
    { id: 'text', content: { text: 'Thanks for being here,\nThe Frequency team' } },
  ]),
}

// ── 5. Founding Business offer (P2) ───────────────────────────────────────────────────────────────────────
const FOUNDING_BUSINESS: BetaLaunchEmail = {
  key: 'founding_business',
  label: 'Founding Business offer',
  phaseKey: 'P2',
  segment: 'members',
  subject: 'Put your business on Frequency as a Founding Business',
  preheader: 'Your own Space, a Founding Business spot, and we set it up with you.',
  blockJson: emailLayout([
    {
      id: 'photoHero',
      content: {
        eyebrow: 'Founding Business',
        title: 'Put your business on Frequency',
        subtitle: 'The people here are your neighbors.',
        image: HERO,
        alt: 'A local business owner welcoming people through the door',
        buttonLabel: 'Claim a Founding Business spot',
        buttonUrl: 'https://frequencylocal.com/pricing',
      },
    },
    {
      id: 'prose',
      content: {
        text: 'Hi,\n\nYou run something local, and the people on Frequency are your neighbors. We would like to offer you a Founding Business spot before this opens up.',
      },
    },
    {
      id: 'editorial',
      content: {
        eyebrow: 'What you get',
        title: 'Your own Space, set up with you',
        body: 'A Founding Business gets its own Space to post events and offers and the lowest rate we will ever set, kept for good. Take the year before September 1 and the Space also wears the Founding Business badge. We will help you set the whole thing up ourselves.',
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'callout',
      content: {
        title: 'Open to the Beta group only',
        body: 'This is open to the Beta group only and closes when the Beta does. Want to talk it through first? Just reply to this email.',
        buttonLabel: 'Claim a Founding Business spot',
        buttonUrl: 'https://frequencylocal.com/pricing',
      },
    },
    { id: 'text', content: { text: 'Talk soon,\nThe Frequency team' } },
  ]),
}

// ── 6. Referral + Circle-starter contest (P3) ─────────────────────────────────────────────────────────────
const REFERRAL_CONTEST: BetaLaunchEmail = {
  key: 'referral_contest',
  label: 'Referral + Circle-starter contest',
  phaseKey: 'P3',
  segment: 'members',
  subject: 'Bring a friend, start a Circle, earn Zaps',
  preheader: 'Invite people you want in the room and start Circles worth showing up to.',
  blockJson: emailLayout([
    { id: 'displayHeading', content: { text: 'Bring a friend, start a Circle', font: 'display' } },
    {
      id: 'prose',
      content: {
        text: "Hi,\n\nWe're running a short contest, and it is simple: invite people you would actually want in the room, and start Circles you would actually show up to.",
      },
    },
    { id: 'heading', content: { text: "Here's how it works" } },
    {
      id: 'features',
      content: {
        items: [
          { icon: '🔗', title: 'Share your link', text: 'Share your invite link with friends who fit.' },
          { icon: '🤝', title: 'They join and stay', text: 'Every friend who joins and sticks around counts.' },
          { icon: '⭕', title: 'Start a Circle', text: 'Start a Circle and grow it to ten active members.' },
        ],
      },
    },
    {
      id: 'text',
      content: {
        text: 'Every friend who joins and takes a real first action pays you 25 Zaps. A Circle you started pays 150 Zaps once it reaches ten active members. It runs for two weeks, and the leaderboard is public the whole time.',
      },
    },
    { id: 'divider', content: {} },
    {
      id: 'callout',
      content: {
        title: 'Go build the room you want to be in.',
        body: 'The Frequency team',
        buttonLabel: 'Get my invite link',
        buttonUrl: 'https://frequencylocal.com/onboarding/beta',
      },
    },
  ]),
}

// ── 7. Sept 1 graduation, full access ends (P4) ───────────────────────────────────────────────────────────
// 🔴 THIS EMAIL USED TO SELL A DEADLINE THAT NO LONGER EXISTS. It was "Opening Beta pricing closes
// September 1", built entirely on the beta price expiring. The owner closed that window early on
// 2026-08-17 (ADR-1060: full price, and two months free on the year instead), so every sentence of the
// old draft was an offer the checkout would refuse. What IS still true about September 1 is the OTHER
// beta window, the feature-gate grace period (`beta_grace`, ADR-874): every Space has had full access to
// every tool and on September 1 each plan starts doing what it says. So the email keeps its slot and its
// date and changes what it is about. No countdown on a price, because there is no longer a price moving.
const GRADUATION: BetaLaunchEmail = {
  key: 'graduation',
  label: 'Sept 1 graduation (full access ends)',
  phaseKey: 'P4',
  segment: 'members',
  subject: 'Full access ends September 1',
  preheader: 'Every Space has had every tool. On September 1 each plan starts doing what it says.',
  blockJson: emailLayout([
    { id: 'displayHeading', content: { text: 'Full access ends September 1', font: 'display' } },
    {
      id: 'prose',
      content: {
        text: 'Hi,\n\nThe Beta is wrapping up. Every Space has had the full set of tools while we were in it, whatever plan it was on. On September 1 each plan starts doing what it says, so this is a good week to work out which one fits how you actually use Frequency.',
      },
    },
    { id: 'text', content: { text: 'Every plan is one price, the same whenever you start. Pay for the year and you get two months free.' } },
    { id: 'divider', content: {} },
    {
      id: 'button',
      content: { label: 'See the plans', url: 'https://frequencylocal.com/pricing', align: 'center' },
    },
    {
      id: 'quote',
      content: {
        text: 'Either way, thank you for helping us get Frequency off the ground. The community you see today exists because you showed up early.',
        by: 'The Frequency team',
      },
    },
  ]),
}

/** The 6 beta launch emails, in launch order. The Studio's left rail renders them as themed, editable cards;
 *  the seeder writes each into `campaigns` with `block_json` = `blockJson`.
 *
 *  🔴 FOUNDING_BUSINESS IS RETIRED AND DELIBERATELY NOT IN THIS LIST (ADR-1067, OWN-025). Its offer was
 *  "the lowest rate we will ever set, kept for good ... take the year before September 1", and the price
 *  behind that promise no longer exists: Business is a flat $29/mo, $290/yr, and the ONLY beta rate in
 *  the catalog is Collective's unlisted $49/$490, which is granted by hand rather than claimed from an
 *  email. An email in this array is SEEDED INTO `campaigns` and is one click from being sent, so leaving
 *  it here would keep a sellable-looking offer for a rate checkout cannot charge.
 *
 *  The constant below is kept, not deleted, because the Founding Business PROGRAM is not retired — the
 *  badge, the 25-per-city cap and the take-rate buy-down are recognition, not a discount. If the owner
 *  wants to make that offer again, the copy is here to edit; what it must not do is quote a founding
 *  RATE. Re-adding it to this array without rewriting that sentence puts the promise straight back. */
export const BETA_LAUNCH_EMAILS: readonly BetaLaunchEmail[] = [
  WAITLIST_CONFIRM,
  WAVE_SOON,
  INVITE,
  FOUNDING_MEMBER,
  REFERRAL_CONTEST,
  GRADUATION,
]

/** Retired (OWN-025). Exported so it is not dead code and so the retirement is greppable, but NOT part
 *  of `BETA_LAUNCH_EMAILS`, so the seeder never writes it into `campaigns`. */
export const RETIRED_FOUNDING_BUSINESS_EMAIL: BetaLaunchEmail = FOUNDING_BUSINESS

/** A flattened text of an email's authored block content (subject + every string leaf of the layout), for the
 *  em-dash voice guard the seeder runs before inserting. Pure. */
export function flattenLaunchEmailText(email: BetaLaunchEmail): string {
  return [email.subject, email.preheader, JSON.stringify(email.blockJson.content ?? {})].join('\n')
}
