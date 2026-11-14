// New Journey suggestions only. No I/O, personal state, completion policy, or reward writes.
import type { ComposePillar } from '@/lib/ai/journey-composition'
import type { ComposedRow } from './compose'
import { extraCreditRow } from './extra-credit'

export const PILLAR_SLOTS: { slug: ComposePillar; label: string; prompt: string }[] = [
  { slug: 'mind', label: 'Mind support', prompt: 'Something for attention, learning or reflection. Keep, replace or remove this suggestion.' },
  { slug: 'body', label: 'Body support', prompt: 'Something for movement, rest or physical care. Keep, replace or remove this suggestion.' },
  { slug: 'spirit', label: 'Spirit support', prompt: 'Something for presence, connection or meaning. Keep, replace or remove this suggestion.' },
  { slug: 'expression', label: 'Expression', prompt: 'Make something, speak, help or connect. You can keep this private.' },
]

const SUPPORTS = ['mind', 'body', 'spirit'] as const
const MASTER_WEEKLY_BONUS_ZAPS = 10

type PillarIds = Partial<Record<ComposePillar, string>>

function anchorPracticeRow(): ComposedRow {
  return {
    block_type: 'practice',
    title: 'Anchor practice',
    body: 'Choose one practice to return to on a rhythm that fits your life. Pick from the library or write your own. You can change or remove this starting point.',
    domain_id: null,
    required: true,
    settings: { anchor: true },
  }
}

/** Supporting areas overlap; suggestions are never a four-part completion quota. */
function suggestedSupportRows(pillarIds: PillarIds): ComposedRow[] {
  return SUPPORTS.map((slug) => {
    const slot = PILLAR_SLOTS.find((row) => row.slug === slug)!
    return { block_type: 'practice', title: slot.label, body: slot.prompt, domain_id: pillarIds[slug] ?? null, required: false, settings: { support_suggestion: true } }
  })
}

/** The explicit manual scaffold: one editable anchor with optional supports and private expression. */
export function personalJourneyRows(pillarIds: PillarIds): ComposedRow[] {
  return [
    anchorPracticeRow(),
    ...suggestedSupportRows(pillarIds),
    { ...extraCreditRow('Expression invitation', 'What might you carry into your day? Make something, speak honestly, help someone or connect. You can keep this private. Optional, with the existing bonus Zaps if you complete it.'), domain_id: pillarIds.expression ?? null },
  ]
}

/** One adaptable week. Its anchor lives once in Onboarding rather than repeating as a quota. */
export function masterWeekRows(pillarIds: PillarIds): ComposedRow[] {
  return [
    { block_type: 'lesson', title: "This week's focus", body: "Open with a hook, ask one honest question, then teach the week's idea in plain words.", required: true },
    ...suggestedSupportRows(pillarIds),
    { ...extraCreditRow('Expression invitation', 'What might you carry into your day this week? Make something, speak, help or connect. You can keep this private. Optional, with the existing bonus Zaps if you complete it.', MASTER_WEEKLY_BONUS_ZAPS), domain_id: pillarIds.expression ?? null },
    { block_type: 'reflection', title: 'Reflect', body: 'What supported you this week? Note something to keep, change or leave for now.', required: false },
  ]
}

/** A welcome, one neutral anchor and an intention. No Pillar is assigned before the author chooses. */
export function masterOnboardingRows(_pillarIds: PillarIds): ComposedRow[] {
  return [
    { block_type: 'lesson', title: 'Welcome', body: 'Set the scene: what this Journey is, who it is for, and how each week runs.', required: true },
    anchorPracticeRow(),
    { block_type: 'reflection', title: 'Set your intention', body: 'What would you like support with? A line or two is plenty, and you can revisit it.', required: false },
  ]
}

/** Expression is welcome throughout; the Close offers another invitation without a prerequisite. */
export function masterCloseRows(pillarIds: PillarIds): ComposedRow[] {
  return [
    { ...extraCreditRow('Expression invitation', 'What might you carry into your day? Make something, speak honestly, help someone or connect. You can keep this private.'), domain_id: pillarIds.expression ?? null },
    { block_type: 'reflection', title: 'Look back', body: 'What supported you, and what would you like to keep or change?', required: false },
  ]
}
