import { describe, it, expect } from 'vitest'
import {
  normalizePageConfig,
  enabledWidgets,
  editorPageConfig,
  isWidgetId,
  DEFAULT_LAYOUT,
  REQUIRED_WIDGETS,
  WIDGET_IDS,
  WIDGET_META,
  type WidgetId,
} from './journey-page-config'
import type { PageWidgetConfig } from './journey-plans'

const ids = (ws: { id: WidgetId }[]) => ws.map((w) => w.id)

describe('isWidgetId', () => {
  it('accepts canonical ids and rejects everything else', () => {
    expect(isWidgetId('next-step')).toBe(true)
    expect(isWidgetId('checklist')).toBe(true)
    expect(isWidgetId('not-a-widget')).toBe(false)
    expect(isWidgetId('')).toBe(false)
  })
})

describe('normalizePageConfig — defaults', () => {
  it('returns the mode default layout when stored is null', () => {
    expect(ids(normalizePageConfig(null, 'active'))).toEqual([...DEFAULT_LAYOUT.active])
    expect(ids(normalizePageConfig(null, 'discovery'))).toEqual([...DEFAULT_LAYOUT.discovery])
  })

  it('treats undefined like null', () => {
    expect(ids(normalizePageConfig(undefined, 'active'))).toEqual([...DEFAULT_LAYOUT.active])
  })

  it('enables every default widget by default', () => {
    expect(normalizePageConfig(null, 'active').every((w) => w.enabled)).toBe(true)
  })
})

describe('normalizePageConfig — stored order + flags', () => {
  it('honours stored order for in-mode ids, then appends untouched defaults', () => {
    const stored: PageWidgetConfig[] = [
      { id: 'checklist', enabled: true },
      { id: 'next-step', enabled: true },
    ]
    const out = ids(normalizePageConfig(stored, 'active'))
    // stored ids first, in their order…
    expect(out.slice(0, 2)).toEqual(['checklist', 'next-step'])
    // …then the remaining defaults follow, none dropped
    expect(out).toContain('progress')
    expect(out).toContain('gamification')
    expect(new Set(out).size).toBe(out.length) // no dupes
  })

  it('honours a disabled flag for a non-required widget', () => {
    const stored: PageWidgetConfig[] = [{ id: 'companions', enabled: false }]
    const w = normalizePageConfig(stored, 'active').find((x) => x.id === 'companions')
    expect(w?.enabled).toBe(false)
    expect(enabledWidgets(stored, 'active').map((x) => x.id)).not.toContain('companions')
  })

  it('defaults a missing enabled flag to true', () => {
    const stored = [{ id: 'progress' } as PageWidgetConfig]
    expect(normalizePageConfig(stored, 'active').find((x) => x.id === 'progress')?.enabled).toBe(true)
  })

  it('preserves per-widget settings as a plain object, coercing bad shapes to {}', () => {
    const stored = [
      { id: 'companions', enabled: true, settings: { variant: 'compact' } },
      { id: 'progress', enabled: true, settings: ['nope'] as unknown as Record<string, unknown> },
    ] as PageWidgetConfig[]
    const out = normalizePageConfig(stored, 'active')
    expect(out.find((x) => x.id === 'companions')?.settings).toEqual({ variant: 'compact' })
    expect(out.find((x) => x.id === 'progress')?.settings).toEqual({})
  })
})

describe('normalizePageConfig — required widgets cannot be disabled', () => {
  it('forces required widgets back on even when stored disables them', () => {
    const stored: PageWidgetConfig[] = [
      { id: 'next-step', enabled: false },
      { id: 'gamification', enabled: false },
    ]
    const out = normalizePageConfig(stored, 'active')
    for (const req of REQUIRED_WIDGETS.active) {
      expect(out.find((x) => x.id === req)?.enabled).toBe(true)
    }
    // and they survive the enabled-only filter
    const en = enabledWidgets(stored, 'active').map((x) => x.id)
    for (const req of REQUIRED_WIDGETS.active) expect(en).toContain(req)
  })

  it('injects a required widget that is entirely absent from stored', () => {
    const stored: PageWidgetConfig[] = [{ id: 'checklist', enabled: true }]
    const out = ids(normalizePageConfig(stored, 'active'))
    expect(out).toContain('next-step')
    expect(out).toContain('gamification')
  })
})

describe('normalizePageConfig — mode isolation + unknown ids', () => {
  it('drops ids that belong to the other mode', () => {
    const stored: PageWidgetConfig[] = [
      { id: 'story', enabled: true }, // discovery-only
      { id: 'next-step', enabled: true }, // active-only
    ]
    expect(ids(normalizePageConfig(stored, 'active'))).not.toContain('story')
    expect(ids(normalizePageConfig(stored, 'discovery'))).not.toContain('next-step')
  })

  it('drops unknown ids entirely', () => {
    const stored = [
      { id: 'bogus-widget', enabled: true },
      { id: 'next-step', enabled: true },
    ] as PageWidgetConfig[]
    const out = ids(normalizePageConfig(stored, 'active'))
    expect(out).not.toContain('bogus-widget' as WidgetId)
    expect(out).toContain('next-step')
  })

  it('ignores malformed entries (missing id / null)', () => {
    const stored = [null, { enabled: true }, { id: 42 }] as unknown as PageWidgetConfig[]
    expect(ids(normalizePageConfig(stored, 'active'))).toEqual([...DEFAULT_LAYOUT.active])
  })

  it('de-dupes a repeated stored id (first wins)', () => {
    const stored: PageWidgetConfig[] = [
      { id: 'checklist', enabled: true },
      { id: 'checklist', enabled: false },
    ]
    const matches = normalizePageConfig(stored, 'active').filter((x) => x.id === 'checklist')
    expect(matches).toHaveLength(1)
    expect(matches[0].enabled).toBe(true)
  })
})

describe('layout invariants', () => {
  it('every default + required id is a canonical widget id', () => {
    const all = [...DEFAULT_LAYOUT.active, ...DEFAULT_LAYOUT.discovery, ...REQUIRED_WIDGETS.active, ...REQUIRED_WIDGETS.discovery]
    for (const id of all) expect(WIDGET_IDS).toContain(id)
  })
})

describe('editorPageConfig — the Studio editor catalog (both faces)', () => {
  it('returns every canonical widget exactly once when stored is null', () => {
    const out = editorPageConfig(null)
    expect([...out.map((w) => w.id)].sort()).toEqual([...WIDGET_IDS].sort())
    expect(new Set(out.map((w) => w.id)).size).toBe(WIDGET_IDS.length)
  })

  it('gives every widget editor metadata (label + hint + mode)', () => {
    for (const id of WIDGET_IDS) {
      expect(WIDGET_META[id]?.label.length ?? 0).toBeGreaterThan(0)
      expect(['active', 'discovery']).toContain(WIDGET_META[id]?.mode)
    }
  })

  it('honours stored order first, then appends the rest, no dupes', () => {
    const out = editorPageConfig([
      { id: 'story', enabled: true },
      { id: 'streak', enabled: true },
    ])
    expect(out.slice(0, 2).map((w) => w.id)).toEqual(['story', 'streak'])
    expect(out).toHaveLength(WIDGET_IDS.length)
  })

  it('forces required widgets enabled even when stored disables them', () => {
    const out = editorPageConfig([
      { id: 'next-step', enabled: false },
      { id: 'path', enabled: false },
    ])
    const byId = new Map(out.map((w) => [w.id, w]))
    for (const id of [...REQUIRED_WIDGETS.active, ...REQUIRED_WIDGETS.discovery]) {
      expect(byId.get(id)?.enabled).toBe(true)
    }
  })

  it('honours a non-required disabled flag and drops unknown / duplicate ids', () => {
    const out = editorPageConfig([
      { id: 'streak', enabled: false },
      { id: 'bogus', enabled: true } as unknown as PageWidgetConfig,
      { id: 'streak', enabled: true },
    ])
    expect(out.find((w) => w.id === 'streak')?.enabled).toBe(false) // first wins
    expect(out.map((w) => w.id)).not.toContain('bogus')
    expect(out).toHaveLength(WIDGET_IDS.length)
  })
})
