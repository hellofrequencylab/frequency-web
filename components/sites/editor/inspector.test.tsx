// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FieldsSchema } from '@/components/page-editor/mobile/field-form'
import type { Config, Data } from '@/lib/page-editor/types'
import { WebsiteChromeInspector, WebsiteInspector } from './inspector'

vi.mock('@/components/page-editor/mobile/field-form', () => ({ FieldForm: ({ fields, value, onChange, onPushScreen }: { fields: FieldsSchema; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void; onPushScreen: (value: unknown) => void }) => <div data-testid="fields">{Object.entries(fields).map(([key, field]) => <div key={key} data-field={key}>{field.type === 'array' && Array.isArray(value[key]) ? value[key].map((item, index) => <button key={index} onClick={() => onPushScreen({ title: 'Card', path: [key, index], fields: field.arrayFields, value: item, onChange: vi.fn() })}>{field.getItemSummary?.(item, index)}</button>) : <input aria-label={key} value={String(value[key] ?? '')} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}</div>)}</div> }))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
afterAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false }) })

it('shows the three rendered catalog cards instead of two ignored inline items, then restores authored labels when catalog is empty', () => {
  const config: Config = { components: { SpaceOfferings: { fields: { heading: { type: 'text' }, items: { type: 'array', arrayFields: { title: { type: 'text' } } } }, render: () => null } } }
  const block = { type: 'SpaceOfferings', props: { id: 'offering', items: [{ title: 'Inline first' }, { title: 'Inline second' }] } }
  const doc: Data = { root: {}, content: [block] }
  const offerings = [{ title: 'Circle Night' }, { title: 'Year-round brotherhood membership' }, { title: 'Desert Retreat' }, { title: 'Private consultation', visibility: 'private' }]
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onChange = vi.fn()
  const props = { config, block, doc, device: 'desktop' as const, onChange, onDisplay: vi.fn(), sourceSettingsHref: 'https://frequency.example/spaces/hearts/settings/services' }
  act(() => root.render(<WebsiteInspector {...props} metadata={{ space: { profile: { offerings } } }} />))
  for (const title of offerings.slice(0, 3).map((item) => item.title)) expect(container.textContent).toContain(title)
  expect(container.textContent).not.toContain('Private consultation')
  expect(container.querySelector('[data-field="items"]')).toBeNull()
  expect(container.querySelector<HTMLAnchorElement>('a')?.href).toBe(props.sourceSettingsHref)
  expect(onChange).not.toHaveBeenCalled()
  act(() => root.render(<WebsiteInspector {...props} metadata={{ space: { profile: { offerings: [] } } }} />))
  expect(container.querySelector('[data-field="items"]')?.textContent).toBe('Inline firstInline second')
  expect(container.textContent).not.toContain('Desert Retreat')
  expect(block.props.items).toHaveLength(2)
  act(() => root.unmount())
  container.remove()
})


it('keeps two nested card field edits and the surrounding authored props', () => {
  const config: Config = { components: { FeatureGrid: { fields: { heading: { type: 'text' }, items: { type: 'array', arrayFields: { title: { type: 'text' }, body: { type: 'text' } } } }, render: () => null } } }
  const changed = vi.fn()
  function Fixture() {
    const [props, setProps] = useState({ id: 'cards', heading: 'Keep heading', items: [{ title: 'Old title', body: 'Old body' }] })
    const block = { type: 'FeatureGrid', props }
    return <WebsiteInspector config={config} block={block} doc={{ root: {}, content: [block] }} device="desktop" onDisplay={vi.fn()} onChange={(next) => { changed(next); setProps(next as typeof props) }} />
  }
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  act(() => root.render(<Fixture />))
  act(() => container.querySelector<HTMLButtonElement>('[data-field="items"] button')!.click())
  const change = (label: string, value: string) => { const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) }) }
  change('title', 'New title'); change('body', 'New body')
  expect(changed).toHaveBeenLastCalledWith({ id: 'cards', heading: 'Keep heading', items: [{ title: 'New title', body: 'New body' }] })
  expect(container.textContent).toContain('Theme default')
  act(() => root.unmount()); container.remove()
})

it('edits website chrome without mutating inherited Space values and resets to inheritance', () => {
  const defaults = { name: 'Space name', tagline: 'Space tagline', cta: { label: 'Book', href: '/book' } }
  const onChange = vi.fn(); const onPages = vi.fn(); const onTheme = vi.fn()
  const container = document.createElement('div'); const root = createRoot(container)
  act(() => root.render(<WebsiteChromeInspector area="header" chrome={{ name: 'Website name', cta: null }} defaults={defaults} onChange={onChange} onPages={onPages} onTheme={onTheme} sourceSettingsHref="https://frequency.example/spaces/hearts/settings" />))
  act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Use Space name')!.click())
  expect(onChange).toHaveBeenLastCalledWith({ cta: null })
  act(() => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Edit page navigation')!.click())
  expect(onPages).toHaveBeenCalledOnce()
  expect(defaults).toEqual({ name: 'Space name', tagline: 'Space tagline', cta: { label: 'Book', href: '/book' } })
  act(() => root.unmount())
})

it('lets a header URL be typed through intermediate invalid text and commits only a valid destination on blur', () => {
  const onChange = vi.fn()
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  act(() => root.render(<WebsiteChromeInspector area="header" defaults={{ name: 'Space', tagline: null, cta: { label: 'Book', href: '/book' } }} onChange={onChange} onPages={vi.fn()} onTheme={vi.fn()} />))
  const input = container.querySelector<HTMLInputElement>('[aria-label="Header button link"]')!
  const type = (value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
  act(() => input.focus()); type('h'); type('https:')
  expect(input.value).toBe('https:')
  expect(onChange).not.toHaveBeenCalled()
  act(() => input.blur())
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('HTTPS')
  expect(onChange).not.toHaveBeenCalled()
  act(() => input.focus()); type('https://example.org/book'); act(() => input.blur())
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ cta: { label: 'Book', href: 'https://example.org/book' } })
  expect(container.querySelector('[role="alert"]')).toBeNull()
  act(() => root.unmount()); container.remove()
})
