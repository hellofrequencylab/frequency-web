// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const m = vi.hoisted(() => ({ spark: vi.fn(), create: vi.fn(), build: vi.fn(), edit: vi.fn(), refresh: vi.fn() }))
const ownWords = '  My first step.\n\nMy second step!  '
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn() }) }))
vi.mock('@/app/(main)/practices/create-actions', () => ({ sparkPracticeAction: m.spark, createPracticeFromSparkAction: m.create }))
vi.mock('@/app/(main)/practices/actions', () => ({ createPracticeDraftAction: vi.fn(), buildPracticeWithVeraAction: m.build, applyVeraPracticeChangeAction: m.edit }))
vi.mock('@/components/studio/spark', () => ({
  SparkDoors: ({ children, onVera }: { children: ReactNode; onVera: () => void }) => <div>{children}<button onClick={onVera}>Get coaching</button></div>,
  SparkDropzone: ({ onSourceText }: { onSourceText: (value: string) => void }) => <button onClick={() => onSourceText('  My first step.\n\nMy second step!  ')}>Use my words</button>,
  SparkShell: ({ children, onNext }: { children: ReactNode; onNext?: () => void }) => <main>{children}{onNext && <button onClick={onNext}>Create Practice</button>}</main>,
  FieldControl: ({ def, value, onChange }: { def: { path: string }; value: string; onChange: (value: string) => void }) => <div><textarea aria-label={def.path} value={value} readOnly />{def.path === 'title' && <button onClick={() => onChange('My chosen title')}>Write title</button>}</div>,
  StudioField: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SparkOffers: () => null,
  useCoverOffer: () => ({ offer: null }), useQualityCheck: () => ({ check: null }), draftText: () => '',
}))
import { PracticeSpark } from './practice-spark'
let root: Root | undefined
let element: HTMLDivElement | undefined
afterEach(() => { if (root) act(() => root!.unmount()); element?.remove(); vi.clearAllMocks() })
function click(text: string) { const button = Array.from(element!.querySelectorAll('button')).find(b => b.textContent === text); expect(button).toBeTruthy(); button!.click() }
it('renders questions apart from exact source text and creates only the author-reviewed fields', async () => {
  m.spark.mockResolvedValue({ data: { questions: ['Who should try this?'], title: 'Attack title', body: 'Attack guide', summary: 'Attack hook' } })
  element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element)
  act(() => root!.render(<PracticeSpark />))
  act(() => click('Use my words'))
  await act(async () => click('Get coaching'))
  expect((element.querySelector('[aria-label="body"]') as HTMLTextAreaElement).value).toBe(ownWords)
  expect((element.querySelector('[aria-label="title"]') as HTMLTextAreaElement).value).toBe('')
  expect(element.querySelector('[role="status"]')?.textContent).toContain('Who should try this?')
  expect(m.create).not.toHaveBeenCalled()
  act(() => click('Write title'))
  await act(async () => click('Create Practice'))
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'My chosen title', body: ownWords, summary: '', description: '' }))
  expect(m.create.mock.calls[0][0]).not.toHaveProperty('questions')
  expect(JSON.stringify(m.create.mock.calls)).not.toContain('Attack')
})
