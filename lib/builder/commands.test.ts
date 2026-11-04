import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILDER_ACTIONS, commandRows, rememberCommand } from './commands'

const ctx = { sections: [{ id: 'hero', name: 'Services hero', title: 'Fine, but not okay' }], pages: [{ slug: 'home', label: 'Home' }], selected: true, recent: [], query: '' }

describe('the command bar (BLD-106)', () => {
  it('every toolbar and rail button is in the registry, and every registry action is in the bar', () => {
    const shell = readFileSync('components/builder/shell/builder-shell.tsx', 'utf8')
    const onButtons = new Set([...shell.matchAll(/data-action=(?:"([\w-]+)"|\{`device-\$\{id\}`\})/g)].map((m) => m[1] ?? 'device-*'))
    for (const id of onButtons) if (id !== 'device-*') expect(Object.keys(BUILDER_ACTIONS)).toContain(id)
    expect(onButtons.has('device-*')).toBe(true)
    const listed = commandRows(ctx).filter((r) => r.group === 'Do').map((r) => r.id.slice(3))
    expect(listed.sort()).toEqual(Object.keys(BUILDER_ACTIONS).sort())
    // The shell runs every action id it lists.
    for (const id of Object.keys(BUILDER_ACTIONS)) expect(shell).toContain(`'${id}'`)
  })
  it('groups Go to, Do, then Ask Vera, and only offers section actions with a section selected', () => {
    const rows = commandRows({ ...ctx, query: 'section' })
    expect(rows.map((r) => r.group)).toEqual([...rows.map((r) => r.group)].sort((a, b) => ['Go to', 'Do', 'Ask Vera'].indexOf(a) - ['Go to', 'Do', 'Ask Vera'].indexOf(b)))
    expect(rows.at(-1)).toMatchObject({ id: 'ask', group: 'Ask Vera' })
    expect(commandRows({ ...ctx, selected: false }).some((r) => r.id.startsWith('do:section-'))).toBe(false)
  })
  it('shows each shortcut and puts recent commands first', () => {
    expect(commandRows(ctx).find((r) => r.id === 'do:undo')?.keys).toBe('⌘Z')
    const recent = rememberCommand(rememberCommand([], 'do:publish'), 'do:focus')
    const doRows = commandRows({ ...ctx, recent }).filter((r) => r.group === 'Do')
    expect(doRows.slice(0, 2).map((r) => r.id)).toEqual(['do:focus', 'do:publish'])
  })
  it('finds a section by its words', () => {
    expect(commandRows({ ...ctx, query: 'not okay' })[0]).toMatchObject({ id: 'go-section:hero', group: 'Go to' })
  })
})
