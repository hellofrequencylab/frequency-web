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

it('starts as connecting when a space id is given', () => {
  expect(renderToStaticMarkup(<CollabCanvas spaceId="3f2b8c1a-0000-4000-8000-000000000001" />)).toContain('Connecting')
})
