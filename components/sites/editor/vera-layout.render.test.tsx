// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Config } from '@/lib/page-editor/types'
import type { WebsiteEditorState } from '@/lib/sites/editor/state'
import type { WebsiteEditorShellProps } from './shell'
import { WebsiteEditorShell } from './shell'

// LIVE-2097: a typed ask with no text selected becomes a LAYOUT proposal. The person ticks lines; Apply writes
// only the ticked ones to the DRAFT as one undo step; nothing saves or publishes on its own.
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))
vi.mock('next/dynamic', () => ({ default: () => () => <div>canvas</div> }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
vi.mock('@/components/spaces/site-menu-editor', () => ({ SiteMenuEditor: () => null }))
vi.mock('./editor.css', () => ({}))
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })

const config: Config = { components: {
  Hero: { label: 'Hero', fields: { title: { type: 'text' } }, render: () => null },
  About: { label: 'About', fields: { body: { type: 'textarea' } }, render: () => null },
  Contact: { label: 'Contact', fields: {}, render: () => null },
} }
const initial: WebsiteEditorState = { v: 1, revision: 0, published: null, versions: [], draft: { theme: 'Menswork', pages: [
  { slug: 'home', label: 'Home', seo: { title: '', description: '' }, comments: [], doc: { root: {}, content: [
    { type: 'Hero', props: { id: 'hero', title: 'My own headline' } },
    { type: 'Contact', props: { id: 'contact' } },
    { type: 'About', props: { id: 'about', body: 'My own story.' } },
  ] } },
] } }
const mounted: (() => void)[] = []
afterEach(() => { mounted.splice(0).forEach((cleanup) => cleanup()) })

function mount(onLayout: NonNullable<WebsiteEditorShellProps['onLayout']>) {
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node)
  const onSave = vi.fn(async (_revision: number, draft: typeof initial.draft, _publish: boolean) => ({ ok: true as const, state: { ...initial, revision: 1, draft } }))
  const onPropose = vi.fn(async () => ({ ok: true as const, promptIds: ['reader' as const] }))
  act(() => root.render(<WebsiteEditorShell host="hearts.example" brandName="Hearts" author="Owner Person" initial={structuredClone(initial)} onPropose={onPropose} onLayout={onLayout} config={config} live={{ events: [], circles: [], journeys: [] }} links={{ origin: 'https://frequency.example', slug: 'hearts', siteBase: '', pages: ['home'], contactHref: null, bookHref: null, email: null }} origin="https://frequency.example" onSave={onSave} />))
  mounted.push(() => { act(() => root.unmount()); node.remove() })
  const buttons = () => Array.from(node.querySelectorAll('button'))
  const click = (label: string) => { const b = buttons().find((x) => x.textContent === label || x.getAttribute('aria-label') === label); expect(b, label).toBeTruthy(); act(() => b!.click()) }
  async function ask(text: string) {
    const input = node.querySelector<HTMLInputElement>('input[aria-label="Ask Vera"]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { setter.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { input.form!.requestSubmit(); await Promise.resolve(); await Promise.resolve() })
  }
  const order = async () => { await act(async () => { click('Save draft'); await Promise.resolve() }); return onSave.mock.calls.at(-1)![1].pages[0].doc.content.map((b: { props: { id?: string } }) => b.props.id) }
  return { node, click, ask, order, onSave, onPropose }
}

it('shows ticked lines, applies only the ticked ones as one undo step, and keeps the words', async () => {
  const onLayout = vi.fn(async () => ({ ok: true as const, note: 'Your story moves up.', refused: ['Change 3: Vera does not write or rewrite your words, so that line was left out.'], changes: [
    { kind: 'move' as const, sectionId: 'about', toPosition: 2 },
    { kind: 'visibility' as const, sectionId: 'contact', device: 'phone' as const, visible: false },
    { kind: 'move' as const, sectionId: 'ghost', toPosition: 1 },
  ] }))
  const { node, click, ask, order, onSave, onPropose } = mount(onLayout)
  await ask('Put my story before the contact form')
  expect(onPropose).not.toHaveBeenCalled()
  expect(onLayout).toHaveBeenCalledWith('Put my story before the contact form', expect.arrayContaining([expect.objectContaining({ id: 'about', position: 3 })]),
    // LIVE-2098: the theme's own style menu rides along, so Vera can only pick what the Style panel offers.
    expect.objectContaining({ dials: expect.arrayContaining([expect.objectContaining({ id: 'corners', options: expect.arrayContaining([expect.objectContaining({ id: 'square' })]) })]) }),
    // LIVE-2110: the draft's facts ride along too, as counts and labels, never the page's words.
    expect.objectContaining({ pageInView: 'Home', pages: [{ label: 'Home', sections: 3, searchDescription: false }] }))
  const boxes = Array.from(node.querySelectorAll<HTMLInputElement>('[data-vera-layout] input[type=checkbox]'))
  expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual(['Move About to position 2', 'Hide Contact on phones'])
  expect(node.querySelector('[data-vera-layout]')?.textContent).toContain('does not write or rewrite your words')
  expect(node.querySelector('[data-vera-layout]')?.textContent).toContain('Your story moves up.')
  expect(onSave).not.toHaveBeenCalled()
  act(() => boxes[1].click())
  click('Apply 1 to draft')
  expect(node.querySelector('[data-vera-layout]')).toBeNull()
  expect(await order()).toEqual(['hero', 'about', 'contact'])
  expect(onSave.mock.calls.at(-1)![2]).toBe(false)
  expect(onSave.mock.calls.at(-1)![1].pages[0].doc.content[1].props.body).toBe('My own story.')
  click('Undo')
  expect(await order()).toEqual(['hero', 'contact', 'about'])
})

it('dismisses a proposal without touching the draft', async () => {
  const onLayout = vi.fn(async () => ({ ok: true as const, note: '', refused: [], changes: [{ kind: 'duplicate' as const, sectionId: 'hero' }] }))
  const { node, click, ask, order } = mount(onLayout)
  await ask('Duplicate the hero')
  expect(node.querySelector('[data-vera-layout]')).toBeTruthy()
  click('Dismiss')
  expect(node.querySelector('[data-vera-layout]')).toBeNull()
  expect(await order()).toEqual(['hero', 'contact', 'about'])
})

it('applies a section move and a site style together as one undo step, on the draft only (LIVE-2098)', async () => {
  const onLayout = vi.fn(async () => ({ ok: true as const, note: '', refused: [], changes: [
    { kind: 'move' as const, sectionId: 'about', toPosition: 1 },
    { kind: 'style' as const, dial: 'corners', option: 'soft' },
    { kind: 'style' as const, dial: 'corners', option: 'blobby' },
  ] }))
  const { node, click, ask, order, onSave } = mount(onLayout)
  await ask('Story first and softer corners')
  const boxes = Array.from(node.querySelectorAll<HTMLInputElement>('[data-vera-layout] input[type=checkbox]'))
  expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual(['Move About to position 1', 'Set Corners to Soft across your site'])
  expect(node.querySelector('[data-vera-layout]')?.textContent).toContain('corners option your theme does not offer')
  click('Apply to draft')
  expect(await order()).toEqual(['about', 'hero', 'contact'])
  expect(onSave.mock.calls.at(-1)![1].look).toEqual({ corners: 'soft' })
  expect(onSave.mock.calls.at(-1)![2]).toBe(false)
  click('Undo')
  expect(await order()).toEqual(['hero', 'contact', 'about'])
  expect(onSave.mock.calls.at(-1)![1].look ?? {}).toEqual({})
})

it('shows a question\'s answer as Vera\'s reply, with nothing to tick and nothing applied (LIVE-2110)', async () => {
  const onLayout = vi.fn(async () => ({ ok: true as const, note: 'Open the Site tab and fill in the Description under Search and sharing.', refused: [], changes: [] }))
  const { node, ask, order, onSave } = mount(onLayout)
  await ask('Is my site ready to publish?')
  const facts = (onLayout.mock.calls[0] as unknown[])[3] as { checks: { ok: boolean; text: string }[] }
  expect(facts.checks.some((c) => !c.ok && /search description/.test(c.text))).toBe(true)
  expect(JSON.stringify(facts)).not.toContain('My own story.')
  expect(node.textContent).toContain('Open the Site tab and fill in the Description under Search and sharing.')
  expect(node.querySelector('[data-vera-layout]')).toBeNull()
  expect(onSave).not.toHaveBeenCalled()
  expect(await order()).toEqual(['hero', 'contact', 'about'])
})

it('adds a section the Add tab offers, at the asked position, as one undo step on the draft (LIVE-2135)', async () => {
  const onLayout = vi.fn(async (...args: unknown[]) => {
    const addable = (args[2] as { sections: { type: string; label: string }[] }).sections
    return { ok: true as const, note: '', refused: [], changes: [{ kind: 'add' as const, blockType: addable[0].type, toPosition: 1 }, { kind: 'add' as const, blockType: 'NotOffered', toPosition: 1 }] }
  })
  const { node, click, ask, order, onSave } = mount(onLayout)
  await ask('Add a section at the top')
  const added = ((onLayout.mock.calls[0] as unknown[])[2] as { sections: { type: string; label: string }[] }).sections[0]
  const boxes = Array.from(node.querySelectorAll<HTMLInputElement>('[data-vera-layout] input[type=checkbox]'))
  expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual([`Add a ${added.label} section at position 1, with placeholder text for your words`])
  expect(node.querySelector('[data-vera-layout]')?.textContent).toContain('does not offer on this page')
  click('Apply to draft')
  const content = (await order())
  expect(content).toHaveLength(4)
  expect(content.slice(1)).toEqual(['hero', 'contact', 'about'])
  expect(onSave.mock.calls.at(-1)![1].pages[0].doc.content[0].type).toBe(added.type)
  expect(onSave.mock.calls.at(-1)![2]).toBe(false)
  click('Undo')
  expect(await order()).toEqual(['hero', 'contact', 'about'])
})

it('previews the ticked lines on the page without touching the draft, and turns off on dismiss (LIVE-2141)', async () => {
  const onLayout = vi.fn(async () => ({ ok: true as const, note: '', refused: [], changes: [
    { kind: 'move' as const, sectionId: 'about', toPosition: 2 },
    { kind: 'visibility' as const, sectionId: 'contact', device: 'phone' as const, visible: false },
  ] }))
  const { node, click, ask, order, onSave } = mount(onLayout)
  await ask('Put my story first')
  expect(node.querySelector('.vera-ghost')).toBeNull()
  click('Preview on page')
  expect(node.querySelector('.vera-ghost')?.textContent).toContain('Previewing 2 changes from Vera. Nothing is on your draft yet.')
  expect(node.querySelector('[data-vera-layout] button[aria-pressed=true]')?.textContent).toBe('Hide preview')
  act(() => node.querySelectorAll<HTMLInputElement>('[data-vera-layout] input[type=checkbox]')[1].click())
  expect(node.querySelector('.vera-ghost')?.textContent).toContain('Previewing 1 change from Vera.')
  expect(onSave).not.toHaveBeenCalled()
  click('Back to your page')
  expect(node.querySelector('.vera-ghost')).toBeNull()
  click('Preview on page')
  click('Dismiss')
  expect(node.querySelector('.vera-ghost')).toBeNull()
  expect(await order()).toEqual(['hero', 'contact', 'about'])
})
