// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BlockInserter } from './block-inserter'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6F. The Space's live sections come third, each saying what it shows, and only when there are some.

const LIVE = { presets: [], blanks: [], live: [{ id: 'events', label: 'Events', say: 'Your next events.' }, { id: 'about', label: 'About', disabled: true as const, reason: 'This page already has as many of these as it can hold.' }] }

describe('live sections in the inserter', () => {
  it('are absent when the Space has none to offer', () => {
    expect(renderToStaticMarkup(<BlockInserter inserter={{ presets: [], blanks: [] }} under="Callout" off={null} onInsert={vi.fn()} />)).not.toContain('data-inserter="live"')
  })
  it('list each with what it shows, at 44px, and a full one says why', () => {
    const html = renderToStaticMarkup(<BlockInserter inserter={LIVE} under="Callout" off={null} onInsert={vi.fn()} />)
    expect(html).toContain('Or show something from your Space')
    expect(html).toMatch(/min-h-11[^>]*aria-label="Add Events"/)
    expect(html).toContain('Your next events.')
    expect(html).toMatch(/disabled=""[^>]*aria-label="Add About"/)
    expect(html).toContain('This page already has as many of these as it can hold.')
  })
  it('sends a live insert by id', async () => {
    const onInsert = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<BlockInserter inserter={LIVE} under="Callout" off={null} onInsert={onInsert} />))
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Add Events"]')!.click())
    expect(onInsert).toHaveBeenCalledWith('live', 'events')
    await act(async () => root.unmount())
  })
})
