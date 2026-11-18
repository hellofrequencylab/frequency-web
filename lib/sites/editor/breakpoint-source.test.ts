import { describe, expect, it } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import { breakpointSourceLabel, resetSectionField, sectionFieldSource } from './breakpoint-source'
import { sectionDeviceLayout } from './layout'
import { updateSectionDisplay } from './state'

const doc = (layout: Record<string, unknown>): Data => ({ root: { props: { websiteLayout: { hero: layout } } }, content: [] } as unknown as Data)

describe('website breakpoint provenance (PROG-E5)', () => {
  it('names the device that set a value, desktop when it is inherited, and the theme when nobody did', () => {
    const page = doc({ desktop: { padding: 88, align: 'left' }, tablet: { padding: 32 } })
    expect(sectionFieldSource(page, 'hero', 'tablet', 'padding')).toBe('tablet')
    expect(sectionFieldSource(page, 'hero', 'tablet', 'align')).toBe('desktop')
    expect(sectionFieldSource(page, 'hero', 'tablet', 'gap')).toBeNull()
    expect(sectionFieldSource(page, 'hero', 'phone', 'padding')).toBe('desktop')
    expect(sectionFieldSource(page, 'hero', 'desktop', 'padding')).toBe('desktop')
    expect(breakpointSourceLabel('tablet', 'tablet')).toBe('Set for tablet')
    expect(breakpointSourceLabel('phone', 'desktop')).toBe('Inherited from desktop')
    expect(breakpointSourceLabel('tablet', null)).toBe('Theme default')
  })

  it('reads the phone one-column rule as the phone default, not as desktop', () => {
    const page = doc({ desktop: { columns: 3 } })
    expect(sectionDeviceLayout(page, 'hero', 'phone').columns).toBe(1)
    expect(sectionFieldSource(page, 'hero', 'phone', 'columns')).toBe('phone-default')
    expect(breakpointSourceLabel('phone', 'phone-default')).toBe('Phone default: one column')
    expect(sectionFieldSource(doc({ desktop: { columns: 3 }, phone: { columns: 2 } }), 'hero', 'phone', 'columns')).toBe('phone')
  })

  it('resets one override on one device and keeps every other override there', () => {
    const page = doc({ desktop: { padding: 88, columns: 3 }, tablet: { padding: 32, columns: 2, align: 'center' }, phone: { padding: 56 } })
    const after = updateSectionDisplay(page, 'hero', 'tablet', resetSectionField(page, 'hero', 'tablet', 'padding'))
    const entry = after.root.props!.websiteLayout!.hero
    expect(entry.tablet).toEqual({ columns: 2, align: 'center' })
    expect(entry.desktop).toEqual({ padding: 88, columns: 3 })
    expect(entry.phone).toEqual({ padding: 56 })
    expect(sectionFieldSource(after, 'hero', 'tablet', 'padding')).toBe('desktop')
  })

  it('returns the phone to its one-column default when its column override is reset', () => {
    const page = doc({ desktop: { columns: 3 }, phone: { columns: 2 } })
    const after = updateSectionDisplay(page, 'hero', 'phone', resetSectionField(page, 'hero', 'phone', 'columns'))
    expect(after.root.props!.websiteLayout!.hero.phone).toEqual({})
    expect(sectionDeviceLayout(after, 'hero', 'phone').columns).toBe(1)
    expect(sectionFieldSource(after, 'hero', 'phone', 'columns')).toBe('phone-default')
  })
})
