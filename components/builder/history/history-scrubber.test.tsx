import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { HistoryScrubber } from './history-scrubber'

const versions = [
  { id: '1', createdAt: '2026-11-10T12:00:00Z', author: 'Ari' },
  { id: '2', createdAt: '2026-11-10T16:00:00Z', author: 'Blake' },
]

it('shows the latest summary and a labelled native range without invoking a write', () => {
  const onPreview = vi.fn()
  const html = renderToStaticMarkup(<HistoryScrubber versions={versions} selectedId={null} onPreview={onPreview} />)
  expect(html).toContain('Preview a version')
  expect(html).toMatch(/type="range"[^>]+min="0"[^>]+max="1"[^>]+value="1"/)
  expect(html).toContain('aria-valuetext="Version 2 of 2,')
  expect(html).toContain('Blake')
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Restore to draft/)
  expect(onPreview).not.toHaveBeenCalled()
})

it('omits the scrubber when there are no versions', () => {
  const html = renderToStaticMarkup(<HistoryScrubber versions={[]} selectedId={null} onPreview={vi.fn()} />)
  expect(html).toContain('No versions yet')
  expect(html).not.toContain('type="range"')
})
