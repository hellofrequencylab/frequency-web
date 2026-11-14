import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CollabCanvas } from './collab-canvas'

it('renders the canvas shell with the device control and a preview frame', () => {
  const html = renderToStaticMarkup(<CollabCanvas />)
  expect(html).toContain('aria-label="Editor canvas"')
  expect(html).toContain('aria-label="Preview device"')
  expect(html).toContain('title="Page preview"')
})

it('says it is a local document without a space', () => {
  expect(renderToStaticMarkup(<CollabCanvas />)).toContain('Local document')
})

it('mounts the responsive inspector beside the frame when given a block', () => {
  const html = renderToStaticMarkup(
    <CollabCanvas inspector={{ title: 'Banner', fields: [{ key: 'title', label: 'Headline', kind: 'textarea' }], elsewhere: 0, initial: { title: 'Come as you are' } }} />,
  )
  expect(html).toContain('aria-label="Block inspector"')
  expect(html).toContain('Banner on desktop')
  expect(html).toContain('Set on desktop')
})

it('mounts no inspector without a block', () => {
  expect(renderToStaticMarkup(<CollabCanvas />)).not.toContain('Block inspector')
})

it('starts as connecting when a space id is given', () => {
  expect(renderToStaticMarkup(<CollabCanvas spaceId="3f2b8c1a-0000-4000-8000-000000000001" />)).toContain('Connecting')
})
