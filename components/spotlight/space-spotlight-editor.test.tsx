// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/spaces/[slug]/manage/spotlight/actions', () => ({
  connectSpotlightDomain: vi.fn(),
  saveSpaceSpotlightLayout: vi.fn(async () => ({})),
  setSpaceSpotlightPublished: vi.fn(),
  setSpaceSpotlightLook: vi.fn(async () => ({})),
  setSpaceSpotlightTheme: vi.fn(async () => ({})),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
vi.mock('@/app/(main)/settings/rail-getters', () => ({ getMemberLayoutRailData: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/rail-getters', () => ({ getSpaceLayoutRailData: vi.fn() }))
import { SpaceSpotlightEditor } from './space-spotlight-editor'
import type { BuilderRailData } from '@/components/entity-blocks/profile-page-builder'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The Spotlight editor runs on the node store only when the server page hands it a node layout
// (render_path_spotlight on); without one it is the legacy builder, unchanged.

const rows = [{ id: 'r0', columns: 1 as const, cells: [['links']] }]
const legacySeed: BuilderRailData = { matchId: 'acme', rows, hidden: [], content: {}, customized: true }
const nodeSeed: BuilderRailData = {
  ...legacySeed,
  nodeLayout: upgradeLayout({ rows, hidden: [], content: {}, style: {} })!,
}

let root: Root, container: HTMLDivElement
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

async function mount(seed: BuilderRailData, themes?: { options: { id: string; label: string }[]; current: string }) {
  await act(async () => {
    root.render(<SpaceSpotlightEditor slug="acme" seed={seed} preview={<div />} initialPublished={false} readOnly={false} themes={themes} />)
  })
}

describe('SpaceSpotlightEditor', () => {
  it('runs the node list builder when the page passes a node layout', async () => {
    await mount(nodeSeed)
    expect(container.querySelector('section[aria-label="Spotlight builder"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Edit Links"]')).not.toBeNull()
  })

  it('keeps the legacy builder when there is no node layout', async () => {
    await mount(legacySeed)
    expect(container.querySelector('section[aria-label="Spotlight builder"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Edit Links"]')).not.toBeNull()
  })

  // LIVE-2274: a Spotlight-only Space (no website, on the default theme, so no looks) still gets the theme row.
  it('offers a theme row without a website, and presses the current theme', async () => {
    await mount(legacySeed, { options: [{ id: 'new-world', label: 'New World' }, { id: 'designer', label: 'Designer' }], current: 'new-world' })
    const row = container.querySelector('section[aria-label="Theme"]')
    expect(row).not.toBeNull()
    const pressed = [...row!.querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed.map((b) => b.textContent)).toEqual(['New World'])
    expect(container.querySelector('section[aria-label="Look"]')).toBeNull()
  })

  it('shows no theme row when none are offered', async () => {
    await mount(legacySeed)
    expect(container.querySelector('section[aria-label="Theme"]')).toBeNull()
  })
})
