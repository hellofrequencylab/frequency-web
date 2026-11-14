import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
const boundary = vi.hoisted(() => ({ advice: vi.fn(async (_input: unknown) => ({ aiUsed: false, questions: ['What would support this intention?'] })) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement('a', { href, ...props }, children) }))
vi.mock('@/components/layout/page-admin-bar', () => ({ PageAdminBar: () => null }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'author' }) }))
vi.mock('@/lib/journey-plans', () => ({ getPlan: async () => ({ plan: { id: 'plan', title: 'A quiet week', summary: 'My chosen intention' }, items: [] }) }))
vi.mock('@/lib/journeys/authoring', () => ({ canEditJourney: async () => true }))
vi.mock('@/lib/practices', () => ({ createPractice: vi.fn() }))
vi.mock('@/lib/pillars', () => ({ getPillars: vi.fn() }))
vi.mock('@/lib/seasons', () => ({ getCurrentSeason: vi.fn() }))
vi.mock('@/lib/ai/journey-slot-coaching', () => ({ draftSlotCoaching: vi.fn() }))
vi.mock('@/lib/ai/journey-edit', () => ({ planJourneyEdits: vi.fn() }))
vi.mock('@/lib/journeys/portable', () => ({ toPortable: vi.fn() }))
vi.mock('@/lib/journeys/compose', () => ({ composeIntoPhase: boundary.advice, pillarIdsBySlug: vi.fn(), insertChildren: vi.fn(), extraCreditRow: vi.fn(), EXTRA_CREDIT_PLACEHOLDER: {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: table === 'journey_plans' ? { source_overview: 'The author chose this anchor.' } : { id: 'week', title: 'Focus', body: 'My own week description' }, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [{ title: 'My familiar anchor' }], count: 0, error: null }),
  }
  // No update/insert/delete methods: this must stay a read-only question request.
  return query
} }) }))
import { populateWeekAction } from './actions'

describe('weekly coaching and published host guidance use the adaptable model', () => {
  it('sends actual planning context with permission to repeat a useful anchor instead of composing four quotas', async () => {
    expect(await populateWeekAction('my-journey', 'week')).toEqual({ data: { aiUsed: false, questions: ['What would support this intention?'] } })
    const context = boundary.advice.mock.calls[0][0] as { description: string }
    expect(context.description).toContain('Offer planning questions')
    expect(context.description).toContain('no four-Pillar quota or public expression is required')
    expect(context.description).toContain('keep or vary them deliberately')
    expect(context.description).toContain('The author chose this anchor.')
    expect(context.description).not.toContain("Compose this week's four Pillar practices")
    expect(context.description).not.toContain('do not repeat')
  })
  it('updates the actual foundations lesson rather than contradicting the changed authoring rubric', () => {
    const lesson = readFileSync('content/leader-training/foundations/circles-and-journeys.md', 'utf8')
    expect(lesson).toContain('Neither the template nor Vera\'s review expects four equal daily tasks')
    expect(lesson).toContain('People do not have to achieve harmony before expressing themselves')
    expect(lesson).toContain('Existing enrollments can retain an Expression requirement')
    expect(lesson).not.toContain('It balances the four Pillars, every week')
    expect(lesson).not.toContain('Keep the four Pillars, the Anchor practice, the two weekly gatherings, and the closing challenge')
  })
  it('renders the changed lesson through the real Markdown renderer and Detail template', async () => {
    const { HelpMarkdown } = await import('@/components/help/help-markdown')
    const { DetailTemplate } = await import('@/components/templates/detail-template')
    const body = readFileSync('content/leader-training/foundations/circles-and-journeys.md', 'utf8').replace(/^---[\s\S]*?---\n/, '')
    const rendered = renderToStaticMarkup(<DetailTemplate title="Circles and Journeys" back={{ href: '/lead/training-library', label: 'Leader Training' }}><div className="max-w-3xl"><HelpMarkdown>{body}</HelpMarkdown></div></DetailTemplate>)
    expect(rendered).toContain('Ways to support yourself')
    expect(rendered).toContain('People do not have to achieve harmony')
    if (process.env.RENDER_OUT) {
      mkdirSync(process.env.RENDER_OUT, { recursive: true })
      writeFileSync(`${process.env.RENDER_OUT}/foundations.html`, `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" class="fq-members">${rendered}</div></body></html>`)
    }
  })

})
