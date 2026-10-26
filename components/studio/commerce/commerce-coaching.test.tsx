// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/loom/picker-actions', () => ({ uploadLoomImage: vi.fn() }))
vi.mock('@/lib/library/image-shrink', () => ({ prepareImageForUpload: vi.fn(), SERVER_MAX_BYTES: 1000 }))
vi.mock('@/lib/studio/kernel/review-kernel', () => ({ sparkFields: () => [{ path: 'title', label: 'Name', kind: 'short', required: true }, { path: 'description', label: 'Description', kind: 'long' }], buildFieldModel: () => ({}) }))
vi.mock('@/components/studio/spark', () => ({
  SparkShell: ({ children, onNext, nextLabel }: { children: ReactNode; onNext?: () => void; nextLabel?: string }) => <div>{children}{onNext && <button onClick={onNext}>{nextLabel}</button>}</div>,
  SparkDoors: ({ onVera }: { onVera: () => void }) => <button onClick={onVera}>Plan with Vera</button>,
  FieldControl: ({ def, value }: { def: { path: string }; value: string }) => <input aria-label={def.path} value={value} readOnly />,
  StudioField: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SparkDropzone: () => null, SparkReview: () => null,
  SparkSteer: ({ onRedraw }: { onRedraw: () => void }) => <button onClick={onRedraw}>Get writing prompts</button>,
  fieldModelText: () => '', useCoverOffer: () => ({ offer: null }), useQualityCheck: () => ({ check: null }),
}))
import { CommerceSpark } from './commerce-spark'
let root: Root; let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container?.remove() })
it('renders questions but cannot autofill malicious model title/description or change create payload', async () => {
  const create = vi.fn(async () => null)
  const coach = vi.fn(async () => ({ title: 'INVENTED TITLE', description: 'INVENTED DESCRIPTION', questions: ['Which concrete details can you explain in your own words?'] }))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<CommerceSpark manifest={{ entity: 'product', label: 'Product', fields: [], steer: {} } as never} eyebrow="Product" doors={{ title: 'Make a listing', description: '' }} details={{ title: 'Details', description: '' }} review={{ title: 'Review', description: '', createLabel: 'Publish' }} initialDraft={{ title: 'My human title', description: 'My human description' }} onDraftCopy={coach} onCreate={create} cancel={{ label: 'Cancel', href: '/' }} />))
  const click = async (text: string) => { const button = [...container.querySelectorAll('button')].find(b => b.textContent === text); expect(button).toBeDefined(); await act(async () => button!.click()) }
  await click('Plan with Vera')
  expect(container.textContent).toContain('Which concrete details can you explain in your own words?')
  expect((container.querySelector('[aria-label="title"]') as HTMLInputElement).value).toBe('My human title')
  expect((container.querySelector('[aria-label="description"]') as HTMLInputElement).value).toBe('My human description')
  await click('Review it'); await click('Get writing prompts'); await click('Publish')
  expect(create).toHaveBeenCalledExactlyOnceWith({ title: 'My human title', description: 'My human description' })
  expect(container.textContent).not.toContain('INVENTED')
})
