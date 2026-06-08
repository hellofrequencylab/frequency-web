import { describe, expect, it } from 'vitest'
import { synthesizeRecommendations, deterministicSummary, type StudioSignal } from './recommendations'
import { isSiteAction, isToggleableFlag, validateActionParams, SITE_ACTIONS } from './site-actions'

const healthy: StudioSignal = {
  support: { open: 1, urgent: 0, unresolved: 1 },
  help: { deflected30: 2, topUnanswered: [], chunks: 50 },
  surfaces: [{ surface: '/feed', views: 100, rageClicks: 0, scrollAvg: 60 }],
  retention: { members: 10, highChurn: 1 },
  ai: { enabled: true },
}

describe('synthesizeRecommendations', () => {
  it('returns an all-clear (good) when every signal is healthy', () => {
    const recs = synthesizeRecommendations(healthy)
    expect(recs).toHaveLength(1)
    expect(recs[0].severity).toBe('good')
  })

  it('flags an empty help index with an applyable reindex action', () => {
    const recs = synthesizeRecommendations({ ...healthy, help: { ...healthy.help, chunks: 0 } })
    const r = recs.find((x) => x.id === 'help_index_empty')
    expect(r?.severity).toBe('risk')
    expect(r?.action?.key).toBe('reindex_help')
  })

  it('offers a one-click toggle when AI is off', () => {
    const recs = synthesizeRecommendations({ ...healthy, ai: { enabled: false } })
    const r = recs.find((x) => x.id === 'ai_off')
    expect(r?.action).toEqual({ key: 'set_flag', params: { flag: 'ai_enabled', value: true }, label: 'Turn AI on' })
  })

  it('flags urgent support, rage-clicks, shallow scroll, and a churn cohort', () => {
    const recs = synthesizeRecommendations({
      support: { open: 12, urgent: 2, unresolved: 12 },
      help: { deflected30: 14, topUnanswered: [{ q: 'how do I cancel', n: 5 }], chunks: 50 },
      surfaces: [
        { surface: '/billing', views: 80, rageClicks: 9, scrollAvg: 70 },
        { surface: '/about', views: 50, rageClicks: 0, scrollAvg: 12 },
      ],
      retention: { members: 20, highChurn: 8 },
      ai: { enabled: true },
    })
    const ids = recs.map((r) => r.id)
    expect(ids).toContain('support_urgent')
    expect(ids).toContain('help_gaps')
    expect(ids.some((i) => i.startsWith('ux_rage_'))).toBe(true)
    expect(ids.some((i) => i.startsWith('ux_scroll_'))).toBe(true)
    expect(ids).toContain('retention_churn')
    // risks sort before watches
    expect(recs[0].severity).toBe('risk')
  })
})

describe('deterministicSummary', () => {
  it('counts risks and watches', () => {
    // empty index (AI on) => a risk; deterministicSummary should mention attention.
    const recs = synthesizeRecommendations({ ...healthy, help: { ...healthy.help, chunks: 0 } })
    expect(recs.some((r) => r.severity === 'risk')).toBe(true)
    expect(deterministicSummary(recs)).toMatch(/attention/)
  })
  it('is reassuring when all clear', () => {
    expect(deterministicSummary(synthesizeRecommendations(healthy))).toMatch(/healthy/)
  })
})

describe('governed site-action registry (the safety allow-list)', () => {
  it('only recognizes registered actions', () => {
    expect(isSiteAction('reindex_help')).toBe(true)
    expect(isSiteAction('set_flag')).toBe(true)
    expect(isSiteAction('rm_-rf')).toBe(false)
    expect(isSiteAction('drop_table')).toBe(false)
  })

  it('restricts flag toggles to the allow-list and requires a boolean', () => {
    expect(isToggleableFlag('ai_enabled')).toBe(true)
    expect(isToggleableFlag('superuser')).toBe(false)
    expect(validateActionParams('set_flag', { flag: 'ai_enabled', value: true })).toEqual({ flag: 'ai_enabled', value: true })
    expect(validateActionParams('set_flag', { flag: 'superuser', value: true })).toBeNull()
    expect(validateActionParams('set_flag', { flag: 'ai_enabled', value: 'yes' })).toBeNull()
    expect(validateActionParams('reindex_help', {})).toEqual({})
  })

  it('every action is admin-gated', () => {
    for (const a of Object.values(SITE_ACTIONS)) expect(a.minRole).toBe('admin')
  })
})
