import { describe, it, expect } from 'vitest'
import { isPageStatus, isVisibilityRole, normalizeStatus } from './status'

describe('page-settings status validation', () => {
  it('recognizes valid statuses only', () => {
    expect(isPageStatus('draft')).toBe(true)
    expect(isPageStatus('published')).toBe(true)
    expect(isPageStatus('archived')).toBe(false)
    expect(isPageStatus(null)).toBe(false)
  })

  it('whitelists the visibility rungs only', () => {
    expect(isVisibilityRole('host')).toBe(true)
    expect(isVisibilityRole('mentor')).toBe(true)
    expect(isVisibilityRole('member')).toBe(false) // 'anyone' is null, not 'member'
    expect(isVisibilityRole('janitor')).toBe(false) // staff axis, not a visibility gate
    expect(isVisibilityRole('')).toBe(false)
  })

  it('normalizes to safe defaults (published / anyone) on bad input', () => {
    expect(normalizeStatus({})).toEqual({ status: 'published', visibility_role: null })
    expect(normalizeStatus({ status: 'nope', visibilityRole: 'whatever' })).toEqual({
      status: 'published',
      visibility_role: null,
    })
  })

  it('keeps valid input', () => {
    expect(normalizeStatus({ status: 'draft', visibilityRole: 'host' })).toEqual({
      status: 'draft',
      visibility_role: 'host',
    })
  })
})
