import { describe, it, expect, vi, beforeEach } from 'vitest'

// The guided messaging generator (Resonance CRM Phase 1). These lock the contract that matters without a
// live model: the OUTPUT SHAPE is always a valid, compile-ready email doc / sequence, the copy is coerced +
// em-dash-stripped, the kill switch is respected, and the generator only ever READS a model and returns DATA
// — it has no send path, so nothing can be enqueued from here (the caller persists the result as a draft).

// Mock the three side-effecting seams so the generator runs end to end without a network / DB. completeRaw is
// a controllable spy per test; the client kill switch + budget gate are forced on; the usage ledger is a noop.
vi.mock('./client', () => ({ aiEnabled: vi.fn(() => true), getAnthropic: () => null }))
vi.mock('./usage', () => ({ featureOverBudget: vi.fn(async () => false), recordAiUsage: vi.fn(async () => {}) }))
vi.mock('./complete', () => ({ completeRaw: vi.fn() }))

import { aiEnabled } from './client'
import { completeRaw } from './complete'
import {
  buildEmailDoc,
  coerceEmailContent,
  coerceSequence,
  generateCampaignDraft,
  generateSequenceDraft,
  MAX_SEQUENCE_STEPS,
  type GenerateMessagingInput,
} from './messaging-generator'
import { dailyCapFor } from './budget'
import { compileEmailDoc } from '@/lib/email-studio/shell'
import { parseEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import { entityBlockById, blockSupportsKind } from '@/lib/entity-blocks/registry'

const aiEnabledMock = vi.mocked(aiEnabled)
const completeRawMock = vi.mocked(completeRaw)

/** Every block id placed in a layout, across every row/column. */
function placedIds(layout: EntityLayout): string[] {
  return (layout.rows ?? []).flatMap((r) => r.cells.flat())
}

const BASE_INPUT: GenerateMessagingInput = {
  goalKey: 'promo',
  goalLabel: 'Promote an event',
  object: 'campaign',
  intent: 'Send one email about an event.',
  audience: 'All members',
  tone: 'warm',
  name: 'Thursday sit',
  details: 'A calm Thursday evening sit at the park.',
}

function toolResult(name: string, input: unknown) {
  return {
    tier: 'sonnet' as const,
    model: 'claude-sonnet-4-6',
    content: [{ type: 'tool_use', id: 't1', name, input }],
    text: '',
    usage: { inputTokens: 10, outputTokens: 20 },
    costUsd: 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  aiEnabledMock.mockReturnValue(true)
})

describe('budget cap', () => {
  it('registers a daily cap for the messaging generator (so it is not on the loose $1 fallback)', () => {
    expect(dailyCapFor('messaging-generator')).toBe(4)
  })
})

describe('buildEmailDoc (deterministic copy → a valid email doc)', () => {
  it('assembles a valid, compile-ready EntityLayout email doc from plain copy', () => {
    const doc = buildEmailDoc({
      subject: 'Come sit on Thursday',
      preheader: 'Five minutes, bring nothing',
      headline: 'A calm Thursday',
      body: ['Hi {{contact.first_name}},', 'We are sitting at the park on Thursday at 7.'],
      ctaLabel: 'RSVP',
      ctaUrl: 'https://frequencylocal.com/events/thursday',
    })

    // Subject + preheader carried through.
    expect(doc.subject).toBe('Come sit on Thursday')
    expect(doc.preheader).toBe('Five minutes, bring nothing')

    // The body is a real EntityLayout that survives the email sanitizer round-trip (it IS what the composer
    // stores), and only carries real email-palette blocks.
    const parsed = parseEntityLayout(doc.layout)
    expect(parsed).not.toBeNull()
    const ids = placedIds(doc.layout)
    expect(ids).toContain('heading')
    expect(ids).toContain('text')
    expect(ids).toContain('button')
    for (const id of ids) {
      const block = entityBlockById(id)
      expect(block).not.toBeNull()
      expect(blockSupportsKind(block!, 'email')).toBe(true)
    }

    // And it compiles to send-ready HTML the same way the composer preview + send do.
    const compiled = compileEmailDoc(doc)
    expect(compiled.html).toContain('A calm Thursday')
    expect(compiled.html).toContain('sitting at the park')
    expect(compiled.html).toContain('RSVP')
    // The merge tag survives the pipeline (resolved per-recipient at send time, not here).
    expect(compiled.html).toContain('{{contact.first_name}}')
  })

  it('drops the button when there is no CTA label, and never emits a non-email block', () => {
    const doc = buildEmailDoc({ subject: 's', preheader: '', headline: 'Hi', body: ['A line.'] })
    expect(placedIds(doc.layout)).not.toContain('button')
  })
})

describe('coerceEmailContent (never trust the raw model shape)', () => {
  it('parses a good tool input and strips em dashes from the copy', () => {
    const c = coerceEmailContent({
      subject: 'Thursday — come by',
      preheader: 'p',
      headline: 'A calm — Thursday',
      body: ['Hi {{contact.first_name}} — welcome.', '  '],
      cta_label: 'RSVP',
      cta_url: 'https://x.test/a',
    })
    expect(c).not.toBeNull()
    expect(c!.subject).not.toContain('—')
    expect(c!.headline).not.toContain('—')
    expect(c!.body).toHaveLength(1) // the blank paragraph is dropped
    expect(c!.body[0]).not.toContain('—')
    expect(c!.ctaLabel).toBe('RSVP')
    expect(c!.ctaUrl).toBe('https://x.test/a')
  })

  it('returns null when there is no usable content (no headline or no body)', () => {
    expect(coerceEmailContent(null)).toBeNull()
    expect(coerceEmailContent({ subject: 'x', body: ['a'] })).toBeNull() // no headline
    expect(coerceEmailContent({ headline: 'H', body: [] })).toBeNull() // no body
  })

  it('falls the subject back to the headline when the model omits one', () => {
    const c = coerceEmailContent({ headline: 'The headline', body: ['A line.'] })
    expect(c!.subject).toBe('The headline')
  })
})

describe('coerceSequence (ordered steps with cadence)', () => {
  it('parses each step, forces the first delay to 0, and keeps later delays', () => {
    const seq = coerceSequence(
      {
        emails: [
          { step_label: 'Welcome', delay_hours: 999, subject: 's1', headline: 'H1', body: ['Hi there.'] },
          { step_label: 'Day 2', delay_hours: 48, subject: 's2', headline: 'H2', body: ['A nudge.'] },
        ],
      },
      5,
    )
    expect(seq).not.toBeNull()
    expect(seq!.steps).toHaveLength(2)
    expect(seq!.steps[0].delayHours).toBe(0) // first step always sends on enrollment
    expect(seq!.steps[1].delayHours).toBe(48)
    // Each step carries a real, compile-ready email doc.
    expect(placedIds(seq!.steps[0].layout)).toContain('heading')
    expect(compileEmailDoc(seq!.steps[1]).html).toContain('A nudge.')
  })

  it('caps the step count and returns null when no step is usable', () => {
    const many = { emails: Array.from({ length: 20 }, (_, i) => ({ subject: `s${i}`, headline: `H${i}`, body: ['x'] })) }
    const seq = coerceSequence(many, MAX_SEQUENCE_STEPS)
    expect(seq!.steps.length).toBeLessThanOrEqual(MAX_SEQUENCE_STEPS)
    expect(coerceSequence({ emails: [{ subject: 'x' }] }, 5)).toBeNull() // no headline/body → dropped → null
  })
})

describe('generateCampaignDraft (model read → a draft doc, never a send)', () => {
  it('returns a valid, compile-ready draft when the model responds, and only ever reads the model', async () => {
    completeRawMock.mockResolvedValue(
      toolResult('draft_campaign_email', {
        subject: 'Come sit Thursday',
        preheader: 'Five minutes',
        headline: 'A calm Thursday',
        body: ['Hi {{contact.first_name}},', 'Come by the park at 7.'],
        cta_label: 'RSVP',
        cta_url: 'https://frequencylocal.com/e/1',
      }) as never,
    )

    const doc = await generateCampaignDraft(BASE_INPUT)
    expect(doc).not.toBeNull()
    expect(doc!.subject).toBe('Come sit Thursday')
    expect(placedIds(doc!.layout)).toEqual(expect.arrayContaining(['heading', 'text', 'button']))
    // Proof nothing sends: the only external call the generator makes is the model read; it returns DATA the
    // CALLER persists as a draft. There is no send / enqueue seam in this module to invoke.
    expect(completeRawMock).toHaveBeenCalledTimes(1)
    expect(compileEmailDoc(doc!).html).toContain('A calm Thursday')
  })

  it('degrades to null (no spend, no send) when the AI kill switch is off', async () => {
    aiEnabledMock.mockReturnValue(false)
    const doc = await generateCampaignDraft(BASE_INPUT)
    expect(doc).toBeNull()
    expect(completeRawMock).not.toHaveBeenCalled()
  })

  it('degrades to null when the model returns no usable tool call', async () => {
    completeRawMock.mockResolvedValue(toolResult('draft_campaign_email', { subject: 'x' }) as never)
    expect(await generateCampaignDraft(BASE_INPUT)).toBeNull()
  })

  it('degrades to null when the model throws (a friendly fallback, nothing saved)', async () => {
    completeRawMock.mockRejectedValue(new Error('model down'))
    expect(await generateCampaignDraft(BASE_INPUT)).toBeNull()
  })
})

describe('generateSequenceDraft', () => {
  it('returns ordered, compile-ready step docs from the sequence tool', async () => {
    completeRawMock.mockResolvedValue(
      toolResult('draft_email_sequence', {
        emails: [
          { step_label: 'Welcome', delay_hours: 0, subject: 'Welcome', headline: 'Hello', body: ['Hi {{contact.first_name}}.'] },
          { step_label: 'Get started', delay_hours: 24, subject: 'First step', headline: 'Start here', body: ['Do this.'] },
        ],
      }) as never,
    )
    const seq = await generateSequenceDraft({
      ...BASE_INPUT,
      goalKey: 'welcome',
      object: 'funnel',
      outline: [
        { title: 'Welcome', timing: 'Right away', note: 'Say hello.' },
        { title: 'Get started', timing: '1 day later', note: 'Point to the first thing.' },
      ],
      stepCount: 2,
    })
    expect(seq).not.toBeNull()
    expect(seq!.steps).toHaveLength(2)
    expect(seq!.steps[0].delayHours).toBe(0)
    expect(compileEmailDoc(seq!.steps[1]).html).toContain('Do this.')
    expect(completeRawMock).toHaveBeenCalledTimes(1)
  })
})
