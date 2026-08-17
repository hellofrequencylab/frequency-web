// ============================================================================
// Beta Command Center — Wave 2: the pre-loaded, best-practice email templates,
// WITH real copy. Nothing here is armed. Seeding loads each one as a DRAFT the owner
// reviews, edits, and (only then) approves. Every string is written to the NAMING +
// CONTENT-VOICE canons: camp-counselor voice, plain sentences, proper nouns carry the
// magic, NO em dashes, at most one exclamation point. The §10 checklist was run on each.
//
// Two homes, both DRAFT-only:
//   • Broadcast one-shots (the invite, the two founding offers, the graduation notice,
//     the referral contest) load as `campaigns` drafts filed under their Beta phase.
//   • The waitlist drip pair (double opt-in confirm + "you're up soon") loads as
//     `nurture_steps` on a Beta waitlist `nurture_sequences` row that ships DISABLED.
//
// Seeding is idempotent and content-writer gated: re-running never duplicates and never
// arms anything. Server-only.

import { betaDb } from './db'
import { writerGate } from './guard'
import { logBetaAction } from './audit'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { revalidatePath } from 'next/cache'
import { BETA_FUNNEL_PERSONA_PREFIX, lintVoice } from './email'
import { BETA_LAUNCH_EMAILS, flattenLaunchEmailText } from './launch-emails'
import type { SegmentKey } from '@/lib/studio/campaigns'

/** The persona that identifies the Beta waitlist drip sequence (Beta-scoped). */
export const BETA_WAITLIST_PERSONA = `${BETA_FUNNEL_PERSONA_PREFIX}waitlist`

export interface BetaEmailTemplate {
  key: string
  /** Human label for the seed report + admin list. */
  label: string
  /** The Beta phase (by key) this template belongs to. */
  phaseKey: string
  subject: string
  body: string
}

/** Broadcast templates → loaded as `campaigns` drafts, one per phase. */
export interface BetaCampaignTemplate extends BetaEmailTemplate {
  segment: SegmentKey
}

/** Drip templates → loaded as `nurture_steps` on the Beta waitlist sequence. */
export interface BetaNurtureTemplate extends BetaEmailTemplate {
  order: number
  delayHours: number
}

// ── The broadcast one-shots (campaigns drafts) ───────────────────────────────

export const BETA_CAMPAIGN_TEMPLATES: BetaCampaignTemplate[] = [
  {
    key: 'invite',
    label: "You're in (Beta invite)",
    phaseKey: 'P1',
    segment: 'beta_waitlist',
    subject: "You're in. Here's your invite to Frequency",
    body: `Hi,

Your wave is up. You're invited to create your Frequency account and join the community near you.

[Create my account](https://frequencylocal.com/onboarding/beta)

Here's what to do first:
1. Pick the Channels you actually care about.
2. Say hi in a thread, or RSVP to one event.
3. Start a Practice, or join one a few other people are already doing.

That's plenty for week one. We're around if you get stuck.

Welcome,
The Frequency team`,
  },
  {
    key: 'founding_member',
    label: 'Founding Member offer',
    phaseKey: 'P2',
    segment: 'members',
    subject: 'Become a Founding Member of Frequency',
    body: `Hi,

You've been here since the early days, so we want to offer you something before it opens to everyone: Founding Member status.

Founding Members lock in the lowest price we will ever set and keep it for good. Take the year before September 1 and you also get the founding badge on your profile, plus a direct line to shape what we build next.

[Become a Founding Member](https://frequencylocal.com/pricing)

This is for the Beta group only, and it closes when the Beta does. No pressure. If the timing is not right, you can join later at the regular price.

Thanks for being here,
The Frequency team`,
  },
  // 🔴 RETIRED: the 'founding_business' template used to sit here (ADR-1067, OWN-025). It offered local
  //    businesses "the lowest rate we will ever set, kept for good ... take the year before September 1",
  //    and there is no Business founding rate any more — Business is a flat $29/mo, $290/yr, and the one
  //    remaining beta rate is Collective's unlisted $49/$490, granted by hand rather than claimed from an
  //    email. Removed rather than reworded because the offer WAS the rate. The Founding Business program
  //    itself (badge, 25-per-city cap, take-rate buy-down) is recognition, not a discount, and survives.
  {
    key: 'referral_contest',
    label: 'Referral + Circle-starter contest',
    phaseKey: 'P3',
    segment: 'members',
    subject: 'Bring a friend, start a Circle, earn Zaps',
    body: `Hi,

We're running a short contest, and it is simple: invite people you would actually want in the room, and start Circles you would actually show up to.

Here's how it works:
1. Share your invite link with friends who fit.
2. Every friend who joins and sticks around counts.
3. Start a Circle and grow it to ten active members.

Every friend who joins and takes a real first action pays you 25 Zaps. A Circle you started pays 150 Zaps once it reaches ten active members. It runs for two weeks, and the leaderboard is public the whole time.

[Get my invite link](https://frequencylocal.com/onboarding/beta)

Go build the room you want to be in.
The Frequency team`,
  },
  {
    key: 'graduation',
    // The pricing deadline this email was built on is gone (owner, 2026-08-17, ADR-1060: full price,
    // two months free on the year). September 1 still ends the FEATURE-GATE grace window (ADR-874), so
    // the email keeps its slot and its date and is about that instead. Mirrors launch-emails.ts.
    label: 'Sept 1 graduation (full access ends)',
    phaseKey: 'P4',
    segment: 'members',
    subject: 'Full access ends September 1',
    body: `Hi,

The Beta is wrapping up. Every Space has had the full set of tools while we were in it, whatever plan it was on. On September 1 each plan starts doing what it says, so this is a good week to work out which one fits how you actually use Frequency.

Every plan is one price, the same whenever you start. Pay for the year and you get two months free.

[See the plans](https://frequencylocal.com/pricing)

Either way, thank you for helping us get Frequency off the ground. The community you see today exists because you showed up early.

The Frequency team`,
  },
]

// ── The waitlist drip pair (nurture steps on a disabled Beta sequence) ────────

export const BETA_NURTURE_TEMPLATES: BetaNurtureTemplate[] = [
  {
    key: 'waitlist_confirm',
    label: 'The Beta is open',
    phaseKey: 'P0',
    order: 1,
    delayHours: 0,
    subject: 'The Frequency Beta is open',
    body: `Hi,

You asked about the Frequency Beta. Good news: it is open, so there is nothing to wait for.

[Start a Circle](https://frequencylocal.com/onboarding/beta)

Join one that is already meeting near you, or start the first one where you live. Free for the whole beta, no card.

If you did not ask for this, you can ignore this email and nothing happens.

See you soon,
The Frequency team`,
  },
  {
    key: 'wave_soon',
    label: 'Wave nurture ("you\'re up soon")',
    phaseKey: 'P1',
    order: 2,
    delayHours: 168,
    subject: "You're near the front of the line",
    body: `Hi,

Quick update: your area is almost ready, so your invite is coming soon. Nothing you need to do yet.

When it lands, you will get a link to create your account and see who is already there. We are keeping the first waves small on purpose, so people arrive to a room with life in it, not an empty one.

Hang tight. We will be in touch shortly.

The Frequency team`,
  },
]

/** All template labels (for the seed report + docs). */
export function betaTemplateLabels(): string[] {
  return [...BETA_NURTURE_TEMPLATES, ...BETA_CAMPAIGN_TEMPLATES].map((t) => `${t.phaseKey} · ${t.label}`)
}

export interface SeedResult {
  campaignsCreated: number
  nurtureStepsCreated: number
  skipped: number
}

/**
 * Load the pre-authored templates as DRAFTS (idempotent, nothing armed). Content-writer
 * gated. Campaign drafts are filed under their phase (approval_status 'draft'); the drip
 * pair lands as steps on a Beta waitlist sequence that ships DISABLED. Re-running skips
 * anything already present (matched by subject + phase for campaigns, by step order for
 * nurture). A self-check refuses to seed any string that fails the em-dash lint.
 */
export async function seedBetaEmailTemplates(): Promise<ActionResult<SeedResult>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const db = betaDb()

  // Resolve phase keys → ids once.
  const { data: phaseRows } = await db.from('beta_phases').select('id, key')
  const phaseIdByKey = new Map<string, string>()
  for (const p of phaseRows ?? []) {
    const row = p as Record<string, unknown>
    phaseIdByKey.set(String(row.key), String(row.id))
  }
  if (phaseIdByKey.size === 0) return fail('The Beta phases are not seeded yet. Apply the Beta migration first.')

  let campaignsCreated = 0
  let nurtureStepsCreated = 0
  let skipped = 0

  // Guard: no template may carry an em dash (defense in depth over the authored copy).
  for (const t of [...BETA_CAMPAIGN_TEMPLATES, ...BETA_NURTURE_TEMPLATES]) {
    if (lintVoice(`${t.subject}\n${t.body}`).hasEmDash) {
      return fail(`Template "${t.label}" contains an em dash. Fix the source copy before seeding.`)
    }
  }

  // Existing beta campaigns (to skip already-seeded subjects per phase).
  const { data: existingCampaigns } = await db
    .from('campaigns')
    .select('subject, phase_id')
    .order('created_at', { ascending: false })
    .limit(500)
  const existingKey = new Set(
    (existingCampaigns ?? []).map((c) => {
      const row = c as Record<string, unknown>
      return `${String(row.phase_id ?? '')}::${String(row.subject ?? '')}`
    }),
  )

  for (const t of BETA_CAMPAIGN_TEMPLATES) {
    const phaseId = phaseIdByKey.get(t.phaseKey)
    if (!phaseId) {
      skipped++
      continue
    }
    if (existingKey.has(`${phaseId}::${t.subject}`)) {
      skipped++
      continue
    }
    const { error } = await db.from('campaigns').insert({
      subject: t.subject,
      body: t.body,
      segment: t.segment,
      status: 'draft',
      approval_status: 'draft',
      phase_id: phaseId,
      created_by: gate.profileId,
    })
    if (error) skipped++
    else campaignsCreated++
  }

  // The Beta waitlist drip sequence (ships DISABLED).
  let sequenceId: string | null = null
  const { data: seq } = await db
    .from('nurture_sequences')
    .select('id')
    .eq('persona', BETA_WAITLIST_PERSONA)
    .maybeSingle()
  if (seq?.id) {
    sequenceId = String(seq.id)
  } else {
    const { data: created } = await db
      .from('nurture_sequences')
      .insert({
        persona: BETA_WAITLIST_PERSONA,
        name: 'Beta waitlist welcome',
        enabled: false,
        created_by: gate.profileId,
      })
      .select('id')
      .maybeSingle()
    sequenceId = created?.id ? String(created.id) : null
  }

  if (sequenceId) {
    const { data: existingSteps } = await db
      .from('nurture_steps')
      .select('step_order')
      .eq('sequence_id', sequenceId)
    const takenOrders = new Set(
      (existingSteps ?? []).map((s) => Number((s as Record<string, unknown>).step_order ?? 0)),
    )
    for (const t of BETA_NURTURE_TEMPLATES) {
      if (takenOrders.has(t.order)) {
        skipped++
        continue
      }
      const { error } = await db.from('nurture_steps').insert({
        sequence_id: sequenceId,
        step_order: t.order,
        delay_hours: t.delayHours,
        subject: t.subject,
        body: t.body,
        enabled: true, // step is enabled; the SEQUENCE stays disabled until armed.
      })
      if (error) skipped++
      else nurtureStepsCreated++
    }
  } else {
    skipped += BETA_NURTURE_TEMPLATES.length
  }

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'seed_email_templates',
    targetType: 'phase',
    targetId: null,
    detail: { campaignsCreated, nurtureStepsCreated, skipped },
  })
  revalidatePath('/admin/beta')
  return ok({ campaignsCreated, nurtureStepsCreated, skipped })
}

/**
 * Seed the 7 THEMED BETA LAUNCH EMAILS (BETA_LAUNCH_EMAILS) as `campaigns` DRAFTS, each carrying its authored
 * `block_json` (an email-kind EntityLayout) so it opens fully designed in the Email Studio and shows as a
 * themed, editable card in the left rail. Content-writer gated (drafting is not sending). Idempotent: an entry
 * whose `(phase_id, subject)` already exists is skipped (the SAME skip key `seedBetaEmailTemplates` uses), so
 * re-running never duplicates and the two seeders coexist. Every entry is written with approval_status 'draft'.
 *
 * SUPERSEDES the campaign-seeding HALF of `seedBetaEmailTemplates` for the launch arc: it seeds ALL 7 emails
 * (including the two waitlist nurture ones) as `campaigns` rows so the rail shows the full arc. It does NOT
 * touch the nurture_sequences / nurture_steps automation seeding, which `seedBetaEmailTemplates` still owns.
 *
 * A self-check refuses to seed any email whose subject + flattened block text fails the em-dash lint (defense
 * in depth over the authored, canon-checked copy).
 */
export async function seedBetaLaunchEmails(): Promise<ActionResult<{ created: number; skipped: number }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const db = betaDb()

  // Resolve phase keys → ids once.
  const { data: phaseRows } = await db.from('beta_phases').select('id, key')
  const phaseIdByKey = new Map<string, string>()
  for (const p of phaseRows ?? []) {
    const row = p as Record<string, unknown>
    phaseIdByKey.set(String(row.key), String(row.id))
  }
  if (phaseIdByKey.size === 0) return fail('The Beta phases are not seeded yet. Apply the Beta migration first.')

  // Guard: no launch email may carry an em dash (over subject + preheader + the flattened block text).
  for (const email of BETA_LAUNCH_EMAILS) {
    if (lintVoice(flattenLaunchEmailText(email)).hasEmDash) {
      return fail(`Launch email "${email.label}" contains an em dash. Fix the source copy before seeding.`)
    }
  }

  // Existing beta campaigns (skip already-seeded subjects per phase — same key as seedBetaEmailTemplates).
  const { data: existingCampaigns } = await db
    .from('campaigns')
    .select('subject, phase_id')
    .order('created_at', { ascending: false })
    .limit(500)
  const existingKey = new Set(
    (existingCampaigns ?? []).map((c) => {
      const row = c as Record<string, unknown>
      return `${String(row.phase_id ?? '')}::${String(row.subject ?? '')}`
    }),
  )

  let created = 0
  let skipped = 0

  for (const email of BETA_LAUNCH_EMAILS) {
    const phaseId = phaseIdByKey.get(email.phaseKey)
    if (!phaseId) {
      skipped++
      continue
    }
    if (existingKey.has(`${phaseId}::${email.subject}`)) {
      skipped++
      continue
    }
    const { error } = await db.from('campaigns').insert({
      subject: email.subject,
      preheader: email.preheader,
      // The body column is NOT NULL; the Studio renders from block_json, so a flat text mirror is a fallback
      // only. Keep it a plain, on-voice one-liner (the real, designed body lives in block_json).
      body: email.preheader,
      block_json: email.blockJson,
      segment: email.segment,
      status: 'draft',
      approval_status: 'draft',
      phase_id: phaseId,
      created_by: gate.profileId,
    })
    if (error) skipped++
    else created++
  }

  await logBetaAction({
    actorProfileId: gate.profileId,
    action: 'seed_launch_emails',
    targetType: 'phase',
    targetId: null,
    detail: { created, skipped },
  })
  revalidatePath('/admin/beta')
  return ok({ created, skipped })
}
