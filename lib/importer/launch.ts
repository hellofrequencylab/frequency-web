// ─────────────────────────────────────────────────────────────────────────────
// THE OWNER LAUNCH, pure half (docs/STUDIO.md; the seeders analysis, 2026-10-21).
//
// The Business Seeder was a staff console. This is its owner-facing front door: a member answers a
// handful of plain questions, one per screen, and the same research, draft and materialize pipeline
// builds their page in the standard Space layout. Nothing here does IO. It owns the QUESTIONS (the
// writing prompts are the product) and the fold of the answers into the one intake the pipeline
// already reads, so the screens, the server action and the tests all share one declaration.
//
// Copy follows docs/CONTENT-VOICE.md: plain, warm, no em dashes. Every question has an example the
// member can tap to see what a good answer looks like, and every question but the name can be skipped,
// because a half-answered launch still produces a page the owner can finish in setup.
// ─────────────────────────────────────────────────────────────────────────────

import { SEED_MOODS, type SeedMood, isSeedMood } from '@/lib/studio/kernel/moods'
import type { IntakeInputs } from '@/lib/importer/intake'

type LaunchQuestionId = 'name' | 'what' | 'who' | 'different' | 'offer' | 'where' | 'links' | 'mood'

export interface LaunchQuestion {
  id: LaunchQuestionId
  /** The screen heading: one question, in the member's own terms. */
  title: string
  /** One calm line under it. */
  help: string
  /** The shape of the answer: a short line, a few sentences, or a pick. */
  kind: 'line' | 'long' | 'mood'
  placeholder?: string
  /** A real example answer, shown under the field so nobody faces a blank box. */
  example?: string
  required?: boolean
}

export const LAUNCH_QUESTIONS: readonly LaunchQuestion[] = [
  {
    id: 'name',
    title: 'What is your business called?',
    help: 'The name people know you by.',
    kind: 'line',
    placeholder: 'River Yoga',
    required: true,
  },
  {
    id: 'what',
    title: 'What do you do, in a sentence?',
    help: 'Say it the way you would to a friend at a party.',
    kind: 'long',
    placeholder: 'I teach small group yoga classes by the river.',
    example: 'I run a small bakery that makes sourdough and pastries for the neighborhood, baked fresh every morning.',
  },
  {
    id: 'who',
    title: 'Who is it for?',
    help: 'The people you love working with, and what they are usually looking for.',
    kind: 'long',
    placeholder: 'Busy people who want to move gently and feel better.',
    example: 'Parents and remote workers who want a calm hour for themselves and are new to yoga.',
  },
  {
    id: 'different',
    title: 'Why do people pick you?',
    help: 'What would a happy customer say about you? Real details beat big claims.',
    kind: 'long',
    placeholder: 'Classes never top eight people, and everyone gets a hello by name.',
    example: 'Eight people at most, so I know every name. I have taught for 12 years and I never rush anyone.',
  },
  {
    id: 'offer',
    title: 'What can people book or buy?',
    help: 'List your main things, one per line. Add prices if you like.',
    kind: 'long',
    placeholder: 'Drop-in class, $20\nMonthly membership, $120\nPrivate session, $90',
  },
  {
    id: 'where',
    title: 'Where are you, and when are you open?',
    help: 'A town or neighborhood, and your usual hours.',
    kind: 'long',
    placeholder: 'Encinitas, CA. Tuesday to Saturday, mornings and evenings.',
  },
  {
    id: 'links',
    title: 'Do you have a website or Instagram?',
    help: 'Optional. If you do, Vera reads it so she can use your own words.',
    kind: 'line',
    placeholder: 'riveryoga.com or @riveryoga',
  },
  {
    id: 'mood',
    title: 'What should it feel like?',
    help: 'Pick the feel that fits. It shapes the words and the look.',
    kind: 'mood',
  },
] as const

/** Answers by question id. Blank and missing are the same thing: skipped. */
export type LaunchAnswers = Partial<Record<LaunchQuestionId, string>>

const CLIP = 1500

function clean(v: string | undefined): string {
  return (v ?? '').replace(/\r/g, '').trim().slice(0, CLIP)
}

/** A website or an @handle from the one "links" line. PURE. */
function parseLinks(raw: string | undefined): { websiteUrl?: string; instagram?: string } {
  const v = clean(raw)
  if (!v) return {}
  if (v.startsWith('@')) return { instagram: v.slice(1).replace(/[^\w.]/g, '') }
  if (/instagram\.com\//i.test(v)) {
    const handle = v.split(/instagram\.com\//i)[1]?.split(/[/?#]/)[0] ?? ''
    return handle ? { instagram: handle.replace(/[^\w.]/g, '') } : {}
  }
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v) || /^https?:\/\//i.test(v)) {
    return { websiteUrl: /^https?:\/\//i.test(v) ? v : `https://${v}` }
  }
  return {}
}

/** Whether the launch has what it needs: a name. Everything else is optional. */
export function launchReady(a: LaunchAnswers): boolean {
  return clean(a.name).length > 0
}

/**
 * Fold the answers into the inputs the research pipeline already reads. The labeled sections go in as
 * ONE pasted source (the same labels the staff form uses, so the extractor treats an owner's words and an
 * operator's identically), and the name, town and mood ride as hints. The consent is the owner's own
 * (`isDemo: false`, `ownerConfirmed: true`): this is their Space, not a staff demo. PURE.
 */
export function launchAnswersToInputs(a: LaunchAnswers): IntakeInputs {
  const parts: string[] = []
  const add = (label: string, v: string | undefined) => {
    const t = clean(v)
    if (t) parts.push(`## ${label}\n${t}`)
  }
  add('Overview', a.what)
  add('Who it is for', a.who)
  add('What makes them different', a.different)
  add('Booking and schedule', a.offer)
  add('Where and when', a.where)

  const links = parseLinks(a.links)
  const inputs: IntakeInputs = { consent: { isDemo: false, ownerConfirmed: true } }
  if (parts.length) inputs.pastedContent = parts.join('\n\n')
  if (links.websiteUrl) inputs.websiteUrl = links.websiteUrl
  if (links.instagram) inputs.socialHandles = { instagram: links.instagram }
  const name = clean(a.name).slice(0, 200)
  const hints: NonNullable<IntakeInputs['hints']> = { type: 'business' }
  if (name) hints.name = name
  const where = clean(a.where).split(/[.\n]/)[0]?.trim()
  if (where) hints.city = where.slice(0, 120)
  inputs.hints = hints
  const mood = clean(a.mood)
  if (isSeedMood(mood)) inputs.mood = mood
  return inputs
}

/** The moods a member can pick, plain labels only. */
export const LAUNCH_MOODS: readonly { key: SeedMood; label: string; description: string }[] = SEED_MOODS.map((m) => ({
  key: m.key,
  label: m.label,
  description: m.description,
}))

/** A rolling-window cap on how many launches one member can start, because each one runs a paid research
 *  and drafting pass. Per day, not lifetime: a second try after an edit is normal. */
export const LAUNCH_DAILY_LIMIT = 3
