import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  listPageHistory: vi.fn(), previewPageVersion: vi.fn(), publishPage: vi.fn(), revertPageToVersion: vi.fn(),
}))
vi.mock('@/app/(main)/edit/actions', () => actions)

import { HistoryPanel, versionSummaries } from './history-panel'

const versions = [
  { id: 'v2', revision: 2, title: 'About', note: null, createdAt: '2026-11-10T16:00:00Z', createdBy: null },
  { id: 'v1', revision: 1, title: 'About', note: 'First cut', createdAt: '2026-11-10T12:00:00Z', createdBy: null },
]

it('names each version by its note or its revision', () => {
  expect(versionSummaries(versions).map((v) => v.author)).toEqual(['Revision 2', 'First cut'])
})

it('opens on the newest version and writes nothing on render', () => {
  const html = renderToStaticMarkup(
    <HistoryPanel slug="about" title="About" initialVersions={versions} initialDraft={{ root: {}, content: [] }} />,
  )
  expect(html).toContain('Version 2 of 2')
  expect(html).toContain('Make this the live page')
  expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Publish draft/)
  for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled()
})

it('asks for a first publish when the page has no history', () => {
  const html = renderToStaticMarkup(<HistoryPanel slug="about" title="About" initialVersions={[]} initialDraft={{ root: {}, content: [] }} />)
  expect(html).toContain('No versions yet')
  expect(html).toContain('Publish this page once to start its history.')
})
