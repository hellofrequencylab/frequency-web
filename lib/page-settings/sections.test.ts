import { describe, it, expect } from 'vitest'
import { PAGE_SETTING_SECTIONS, canManagePageSettings } from './sections'

describe('page-settings spine', () => {
  it('declares the interior page sections in spine (hierarchy) order', () => {
    // Identity first, then who-can-see, then how-it-shows-up, with the interior-layout
    // control last (it only applies on module-driven pages).
    expect(PAGE_SETTING_SECTIONS.map((s) => s.id)).toEqual(['basics', 'status', 'seo', 'layout'])
  })

  it('is interior-only — never exposes a shell-chrome control', () => {
    // The shell rail (global chrome) is a platform concern, not a page setting.
    expect(PAGE_SETTING_SECTIONS.map((s) => s.id)).not.toContain('chrome')
  })

  it('ships every interior section live', () => {
    const live = PAGE_SETTING_SECTIONS.filter((s) => s.status === 'live').map((s) => s.id)
    const next = PAGE_SETTING_SECTIONS.filter((s) => s.status === 'next').map((s) => s.id)
    expect(live).toEqual(['basics', 'status', 'seo', 'layout'])
    expect(next).toEqual([])
  })

  it('every section carries an operator label, a question, and a hint', () => {
    for (const s of PAGE_SETTING_SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.question.endsWith('?')).toBe(true)
      expect(s.hint.length).toBeGreaterThan(0)
    }
  })

  it('keeps brand copy free of em dashes', () => {
    for (const s of PAGE_SETTING_SECTIONS) {
      expect(s.hint).not.toContain('—')
      expect(s.question).not.toContain('—')
    }
  })

  it('gates on the staff web_role axis, not the community ladder', () => {
    expect(canManagePageSettings('admin')).toBe(true)
    expect(canManagePageSettings('janitor')).toBe(true)
    expect(canManagePageSettings('none')).toBe(false)
    expect(canManagePageSettings(null)).toBe(false)
    expect(canManagePageSettings(undefined)).toBe(false)
  })
})
