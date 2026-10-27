import { describe, expect, it } from 'vitest'
import { goingLine } from './going-line'

describe('goingLine', () => {
  it('is empty when nobody is going', () => {
    expect(goingLine({ names: [], total: 0, you: false })).toBe('')
  })
  it('names one person with "is going"', () => {
    expect(goingLine({ names: ['Audrey'], total: 1, you: false })).toBe('Audrey is going')
  })
  it('joins two names with "and"', () => {
    expect(goingLine({ names: ['Audrey', 'Marcus'], total: 2, you: false })).toBe('Audrey and Marcus going')
  })
  it('adds "others" only when a remainder is left', () => {
    expect(goingLine({ names: ['Marcus', 'Priya'], total: 9, you: false })).toBe('Marcus, Priya and 7 others going')
    expect(goingLine({ names: ['Marcus', 'Priya'], total: 3, you: false })).toBe('Marcus, Priya and 1 other going')
  })
  it('leads with You when the viewer is going', () => {
    expect(goingLine({ names: ['Marcus', 'Priya'], total: 9, you: true })).toBe('You, Marcus, Priya and 7 others going')
    expect(goingLine({ names: [], total: 0, you: true })).toBe('You going')
  })
  it('counts people when no names are shown', () => {
    expect(goingLine({ names: [], total: 4, you: false })).toBe('4 people going')
    expect(goingLine({ names: [], total: 4, you: true })).toBe('You and 4 others going')
  })
})
