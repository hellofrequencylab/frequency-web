// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FieldsSchema } from '@/components/page-editor/mobile/field-form'
import type { Config, Data } from '@/lib/page-editor/types'
import { WebsiteInspector } from './inspector'

vi.mock('@/components/page-editor/mobile/field-form', () => ({ FieldForm: ({ fields, value }: { fields: FieldsSchema; value: Record<string, unknown> }) => <div data-testid="fields">{Object.entries(fields).map(([key, field]) => <div key={key} data-field={key}>{field.type === 'array' && Array.isArray(value[key]) ? value[key].map((item, index) => <button key={index}>{field.getItemSummary?.(item, index)}</button>) : key}</div>)}</div> }))
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
