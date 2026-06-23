// The pre-interaction BRIEF (ADR-372 · docs/CRM-OVERHAUL.md Phase 4). The brief's highest-value AI
// surface: context BEFORE a touch, not analytics after it. A member about to reach out to someone in
// their personal contacts gets a short, grounded "who is this, our history, a way in" brief.
//
// Server-side on the Claude API, cheap tier (it is a summary), metered through the ai_usage ledger
// like every other AI feature (lib/ai/connections-ai.ts is the sibling pattern). Degrades to null on
// any failure or when AI is off / over budget (the caller gates with aiAvailable + featureOverBudget),
// so the product never depends on the model being up. NEVER auto-sends anything (ADR-028): it only
// returns text the member reads.
//
// SHAPE: a PURE context builder (`buildBriefContext`, no IO, fully testable) + the AI call
// (`generateContactBrief`). Voice is injected via withVoice so the brief obeys the canon (no em dashes,
// plain sentences, concrete over abstract).

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { MODELS } from '@/lib/ai/models'
import { estimateCostUsd } from '@/lib/ai/budget'
import { recordAiUsage } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import type { TimelineEntry } from './timeline'

export interface BriefInputs {
  name: string
  title?: string | null
  company?: string | null
  city?: string | null
  tags?: string[]
  notes?: { body: string; createdAt: string | null }[]
  timeline?: TimelineEntry[]
  openReminders?: { dueAt: string; note: string | null }[]
  lastContactedAt?: string | null
}

const day = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : '')

/**
 * Assemble the compact fact sheet the model summarizes. PURE and deterministic: only sections with
 * real content are emitted (an empty contact yields just the name line), lists are capped, and copy
 * is passed through verbatim (the model is told to use ONLY these facts). No IO.
 */
export function buildBriefContext(i: BriefInputs): string {
  const lines: string[] = [`Name: ${i.name}`]
  const role = [i.title, i.company].filter(Boolean).join(' at ')
  if (role) lines.push(`Role: ${role}`)
  if (i.city) lines.push(`Location: ${i.city}`)
  if (i.tags && i.tags.length) lines.push(`Tags: ${i.tags.slice(0, 12).join(', ')}`)
  if (i.lastContactedAt) lines.push(`Last contacted: ${day(i.lastContactedAt)}`)

  const notes = (i.notes ?? []).filter((n) => n.body?.trim())
  if (notes.length) {
    lines.push('Notes:')
    for (const n of notes.slice(0, 10)) lines.push(`- ${n.body.trim()}`)
  }

  const timeline = (i.timeline ?? []).filter((e) => e.title?.trim())
  if (timeline.length) {
    lines.push('Recent timeline:')
    for (const e of timeline.slice(0, 12)) {
      lines.push(`- ${day(e.at)} ${e.title}${e.detail ? `: ${e.detail}` : ''}`.trim())
    }
  }

  const reminders = (i.openReminders ?? []).filter((r) => r.dueAt)
  if (reminders.length) {
    lines.push('Open follow-ups:')
    for (const r of reminders.slice(0, 5)) lines.push(`- due ${day(r.dueAt)}${r.note ? `: ${r.note}` : ''}`)
  }

  return lines.join('\n')
}

const SYSTEM = `You are Vera, Frequency's assistant. A member is about to reach out to someone in their personal contacts and wants a short prep brief. Using ONLY the facts provided, write a brief with exactly three short labeled parts:
- Who they are: one plain sentence.
- Your history: one or two sentences on how you know them and the most recent touches. If there is little history, say so plainly rather than padding.
- A way in: one concrete, low-pressure suggestion for the next message or topic, grounded in the facts.
Rules: never invent a fact that is not provided. Warm but not gushing. Keep the whole brief under 90 words. No em dashes.`

/**
 * Write the brief from a prepared context. Cheap tier (Haiku), metered, fail-safe to null. Returns
 * the brief text, or null when AI is unavailable, the context is empty, or the call fails. The caller
 * is responsible for the aiAvailable + featureOverBudget gate (mirrors lib/ai/connections-ai.ts).
 */
export async function generateContactBrief(input: {
  context: string
  profileId?: string | null
}): Promise<string | null> {
  const ctx = input.context.trim()
  if (!ctx) return null
  try {
    const res = await completeRaw({
      tier: 'haiku',
      maxTokens: 400,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      messages: [{ role: 'user', content: [{ type: 'text', text: `Facts:\n${ctx}\n\nWrite the brief.` }] }],
    })
    void recordAiUsage({
      feature: 'crm-brief',
      model: MODELS.haiku,
      usage: res.usage,
      costUsd: estimateCostUsd('haiku', res.usage),
      profileId: input.profileId ?? null,
    })
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    return text || null
  } catch {
    return null
  }
}
