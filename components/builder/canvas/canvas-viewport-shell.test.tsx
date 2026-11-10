import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { CanvasViewportShell } from './canvas-viewport-shell'

it.each([
  ['desktop', 1280],
  ['tablet', 820],
  ['phone', 390],
] as const)('provides an accessible %s device control and real frame width', (device, width) => {
  const html = renderToStaticMarkup(
    <CanvasViewportShell surface="site" device={device} onDeviceChange={vi.fn()}>
      <p>Page content</p>
    </CanvasViewportShell>,
  )
  expect(html).toContain('aria-label="Preview device"')
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
  expect(html).toContain('title="Page preview"')
  expect(html).toContain(`width="${width}"`)
  expect(html).toContain('sandbox="allow-same-origin"')
  expect(html).not.toContain('allow-scripts')
})
