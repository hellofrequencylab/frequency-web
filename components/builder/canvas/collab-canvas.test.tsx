import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CollabCanvas } from './collab-canvas'

it('renders the canvas shell with the device control and a preview frame', () => {
  const html = renderToStaticMarkup(<CollabCanvas />)
  expect(html).toContain('aria-label="Editor canvas"')
  expect(html).toContain('aria-label="Preview device"')
  expect(html).toContain('title="Page preview"')
})
