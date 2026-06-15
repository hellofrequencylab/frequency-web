import { describe, it, expect } from 'vitest'
import { PAGE_SETTING_SECTIONS, canManagePageSettings } from './sections'

describe('page-settings spine', () => {
  it('declares the interior page sections in spine order', () => {
    expect(PAGE_SETTING_SECTIONS.map((s) => s.id)).toEqual(['layout', 'seo', 'status'])
  })

  it('is interior-only — never exposes a shell-chrome control', () => {
    // The shell rail (global chrome) is a platform concern, not a page setting.
    expect(PAGE_SETTING_SECTIONS.map((s) => s.id)).not.toContain('chrome')
  })

  it('ships SEO + Status live; Layout stages as next', () => {
    const live = PAGE_SETTING_SECTIONS.filter((s) => s.status === 'live').map((s) => s.id)
    const next = PAGE_SETTING_SECTIONS.filter((s) => s.status === 'next').map((s) => s.id)
    expect(live).toEqual(['seo', 'status'])
    expect(next).toEqual(['layout'])
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
