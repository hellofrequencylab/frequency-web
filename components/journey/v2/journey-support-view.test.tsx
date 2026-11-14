// @vitest-environment jsdom
// Real UI with synthetic author state. This is not authenticated production evidence.
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/journeys/new' }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/app/(main)/journeys/actions', () => ({ saveJourneyMeta: vi.fn(), setJourneyVisibility: vi.fn(), adoptJourney: vi.fn(), uploadJourneyCover: vi.fn(), setJourneyHeaderFocus: vi.fn() }))
vi.mock('@/app/(main)/journeys/create-actions', () => ({ createJourneyDraftAction: vi.fn(), sparkJourneyAction: vi.fn(), createJourneyFromSparkAction: vi.fn(), createMasterFrameworkAction: vi.fn(), createJourneyFromTemplateAction: vi.fn(), extractOverviewFilesAction: vi.fn() }))
vi.mock('@/app/(main)/journeys/[slug]/edit/actions', () => ({ addPhaseAction: vi.fn() }))
vi.mock('@/app/(main)/journeys/[slug]/guide/actions', () => ({ saveGuideProgressAction: vi.fn(), applyGuideTemplateAction: vi.fn(), saveGuideScheduleAction: vi.fn() }))
vi.mock('@/lib/loom/cover-actions', () => ({ coverOfferAvailableAction: async () => ({ available: false }), generateEntityCoverAction: vi.fn() }))
vi.mock('@/lib/ai/quality-gate-actions', () => ({ reviewEntityDraftAction: vi.fn() }))
vi.mock('@/lib/studio/spark-actions', () => ({ extractSourceTextAction: vi.fn() }))
vi.mock('@/lib/studio/draft-actions', () => ({ discardSparkDraftAction: vi.fn(), loadSparkDraftAction: async () => ({ data: null }), saveSparkDraftAction: vi.fn() }))
import { JourneyBuilder } from './journey-builder'
import { JourneyGuide } from './journey-guide'
import { JourneySpark } from './journey-spark'

let element: HTMLDivElement | undefined
let root: Root | undefined
afterEach(() => { if (root) act(() => root!.unmount()); element?.remove(); root = undefined })
function mount(view: React.ReactNode) {
  element = document.createElement('div')
  document.body.appendChild(element)
  root = createRoot(element)
  act(() => root!.render(view))
}
function fixture(name: string) {
  if (!process.env.RENDER_OUT) return
  mkdirSync(process.env.RENDER_OUT, { recursive: true })
  writeFileSync(`${process.env.RENDER_OUT}/${name}.html`, `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" class="fq-members">${element!.innerHTML}</div></body></html>`)
}

describe('Journey support wording in real author surfaces', () => {
  it('describes actual Vera coaching in the deferred-creation builder', () => {
    mount(<JourneyBuilder draft />)
    expect(element!.textContent).toContain('Vera questions to clarify your intention')
    expect(element!.textContent).not.toContain('balanced four-Pillar week')
    fixture('builder')
  })
  it('shows optional support and expression in the actual guide template choice', () => {
    mount(<JourneyGuide plan={{ planId: 'fixture-plan', slug: 'fixture', title: 'A rhythm that fits', summary: null, intro: null, coverImage: null, visibility: 'private', dripIntervalDays: 7, windowStartsAt: null, windowEndsAt: null }} phases={[]} templates={[]} access={{ canPublish: true, canRunCohorts: true, dripAllowed: true, publishCap: null }} initialPhase="shape" />)
    expect(element!.textContent).toContain('one anchor, optional supporting practices, expression and reflection')
    fixture('guide')
  })
  it('reaches the real Spark template picker with the same adaptable promise', async () => {
    mount(<JourneySpark />)
    const button = [...element!.querySelectorAll('button')].find((entry) => entry.textContent?.includes('Start with a template'))
    expect(button).toBeDefined()
    await act(async () => button!.click())
    expect(element!.textContent).toContain('one anchor, optional supporting practices')
    expect(element!.textContent).not.toContain('The proven shape')
    fixture('spark-template')
  })
})
