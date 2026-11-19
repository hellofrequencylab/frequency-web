// FIXTURE RENDER (LIVE-2396): the Practice editor with its Timer section, and the Practice page's
// timer card, to $RENDER_OUT/practice-editor-*.html and $RENDER_OUT/practice-timer-panel.html.
// Compile the CSS first: node scripts/render/build-css.mjs $RENDER_OUT/app.css
import { createElement, type ReactNode } from 'react'
import { prerenderToNodeStream } from 'react-dom/static'
import { writeFileSync } from 'node:fs'
import { it, vi } from 'vitest'

vi.mock('@/lib/theme/design', async (orig) => ({ ...(await orig<object>()), SITE_DESIGN: 'frequency' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => '/practices/fixture' }))
vi.mock('@/app/(main)/practices/actions', () => ({ updatePracticeAction: vi.fn(), setPracticeTagsAction: vi.fn(), setPracticeRewardAction: vi.fn(), deleteOwnPracticeAction: vi.fn() }))
vi.mock('@/app/(main)/practices/create-actions', () => ({ submitPracticeForReviewAction: vi.fn() }))
vi.mock('@/components/ui/image-upload', () => ({ ImageUpload: () => null }))
vi.mock('@/components/admin/danger-modal', () => ({ DangerModal: () => null }))
vi.mock('@/components/on-air/mindless', () => ({ useMindless: () => ({ open: () => {} }) }))
vi.mock('@/components/on-air/movement', () => ({ useMovement: () => ({ open: () => {} }) }))

const out = process.env.RENDER_OUT
const page = (body: string, wrap = 'fqm-body') =>
  `<!doctype html><html data-design="frequency" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"></head><body><div data-kit="members" data-energy="still"><div class="${wrap}">${body}</div></div></body></html>`
async function html(node: ReactNode): Promise<string> {
  const { prelude } = await prerenderToNodeStream(node)
  const chunks: Buffer[] = []
  for await (const c of prelude) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks).toString()
}

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444']
const common = {
  id: 'fixture', cadence: 'Daily', category: null, icon: 'waves', subcategoryId: null, headerImage: null, weightClass: 'standard',
  pillars: ids.map((id, i) => ({ id, name: ['Mind', 'Body', 'Spirit', 'Expression'][i] })), subcategories: [], initialTags: ['morning', 'quick'],
  status: 'draft', isPublic: false, durationLocked: false, warmupMessage: null, warmupSec: null,
  suggestTimer: async () => ({ ok: true as const, data: { picks: [], vera: false } }),
}

it('renders the Practice editor in each timer mode', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { PracticeBuilder } = await import('@/components/studio/practice/practice-builder')
  const states = {
    still: { title: 'Box breathing before a hard call', summary: 'Two minutes to steady yourself before you dial.', description: 'For anyone who tightens up before a hard conversation.', body: '- Sit down.\n- Breathe in for four.\n- Hold for four.', durationMin: 5, timerKind: 'mindless', movementConfig: null, mindlessMode: 'breathe', breathPattern: 'box', domainId: ids[0], focusDetails: { [ids[0]]: { instructions: '', timing: '' } } },
    move: { title: 'Evening walk', summary: 'Twenty easy minutes outside after dinner.', description: 'For people who sit all day.', body: '- Shoes on.\n- Loop the block.', durationMin: 20, timerKind: 'movement', movementConfig: { mode: 'walk', walkMinutes: 20, walkIntervalMin: 0 }, mindlessMode: null, breathPattern: null, domainId: ids[1], focusDetails: { [ids[1]]: { instructions: '', timing: '' } } },
    blank: { title: '', summary: null, description: null, body: null, durationMin: null, timerKind: 'mindless', movementConfig: null, mindlessMode: null, breathPattern: null, domainId: null, focusDetails: {} },
  }
  for (const [name, state] of Object.entries(states)) {
    const markup = await html(createElement(PracticeBuilder, { ...common, ...state } as never))
    writeFileSync(`${out}/practice-editor-${name}.html`, page(markup))
  }
})

it('renders the Practice page timer card in each state', async () => {
  if (!out) throw new Error('set RENDER_OUT')
  const { PracticeTimerPanel } = await import('@/components/practice/practice-timer-panel')
  const { PracticeTimerButton } = await import('@/components/practice/practice-timer-button')
  const start = (timerKind: 'mindless' | 'movement') => createElement(PracticeTimerButton, { prominent: true, practiceId: 'fixture', timerKind })
  const cards = [
    ['A member who adopted a breathing practice', createElement(PracticeTimerPanel, { config: { timerKind: 'mindless', mindlessMode: 'breathe', breathPattern: 'box', durationMin: 5, warmupSec: 10, warmupMessage: 'Sit tall.' }, action: start('mindless') })],
    ['The author of a Get Moving practice', createElement(PracticeTimerPanel, { config: { timerKind: 'movement', movementConfig: { mode: 'strength', strengthKind: 'tabata' } }, action: start('movement'), setupHref: '/practices/fixture/edit#timer' })],
    ['The author, before the timer is set up', createElement(PracticeTimerPanel, { config: { timerKind: 'mindless' }, action: start('mindless'), setupHref: '/practices/fixture/edit#timer' })],
    ['A visitor looking at a log-only practice', createElement(PracticeTimerPanel, { config: { timerKind: 'none' } })],
  ] as const
  let body = '<div style="max-width:760px;margin:0 auto;padding:24px 16px">'
  for (const [label, node] of cards) body += `<p class="eyebrow" style="margin:20px 0 8px">${label}</p>${await html(node)}`
  writeFileSync(`${out}/practice-timer-panel.html`, page(`${body}</div>`, 'fixture'))
})
