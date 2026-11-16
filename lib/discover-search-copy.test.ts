import { describe, expect, it } from 'vitest'
import { localSearchTitle, searchDescription } from './discover-search-copy'

describe('public discovery search copy', () => {
  it('uses public locality without repeating it or matching a partial word', () => {
    expect(localSearchTitle('Craft Night', ' Vista ')).toBe('Craft Night in Vista')
    expect(localSearchTitle('Meld Coworking (VISTA)', 'Vista')).toBe('Meld Coworking (VISTA)')
    expect(localSearchTitle('Chula VistaCraft Night', 'Vista')).toBe('Chula VistaCraft Night in Vista')
    expect(localSearchTitle('Online Craft Night', null)).toBe('Online Craft Night')
  })

  it('uses a fallback for blank copy and normalizes or shortens the host’s copy', () => {
    expect(searchDescription(' \n ', 'Fallback.')).toBe('Fallback.')
    expect(searchDescription(' Bring a project.\nMeet your neighbors. ', 'Fallback.'))
      .toBe('Bring a project. Meet your neighbors.')
    const description = searchDescription('Bring a project to the table. '.repeat(8), 'Fallback.')
    expect(description.length).toBeLessThanOrEqual(155)
    expect(description).toMatch(/\b\w+\.?…$/)
  })
})
