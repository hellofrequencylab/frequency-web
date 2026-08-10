import { describe, it, expect } from 'vitest'
import { menuWritesMissingNote, stripSqlComments } from './check-migrations.mjs'

// The MENU CACHE rule (ADR-973). All 18 Menu Manager mutations end with
// `revalidatePath('/', 'layout')`; raw SQL cannot. `app/(marketing)/layout.tsx` reads the header
// and footer menus while deliberately avoiding cookies()/getUser() so those pages stay STATIC, so
// a menu reseed leaves them holding the old rail until ISR rolls (revalidate = 3600).
//
// A gate cannot make a .sql file call a Next.js cache API. It can refuse a migration that does not
// state its own consequence, which is what this rule does.

const read = (map: Record<string, string>) => (f: string) => map[f] ?? ''

describe('menuWritesMissingNote', () => {
  it('flags a menu write with no note', () => {
    const files = { 'a.sql': "insert into menu_items (label) values ('X');" }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual(['a.sql'])
  })

  it('accepts one that carries the note', () => {
    const files = { 'a.sql': "-- MENU CACHE: deploy after applying.\ninsert into menu_items (label) values ('X');" }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })

  it('covers update and delete, not just insert', () => {
    const files = {
      'u.sql': "update public.menus set label = 'X';",
      'd.sql': 'delete from menu_categories where id = 1;',
    }
    expect(menuWritesMissingNote(Object.keys(files), read(files)).sort()).toEqual(['d.sql', 'u.sql'])
  })

  it('covers every seeded menu table', () => {
    const tables = ['menus', 'menu_items', 'menu_categories', 'menu_settings', 'menu_rail_cards']
    for (const t of tables) {
      const files = { 'x.sql': `insert into ${t} (a) values (1);` }
      expect(menuWritesMissingNote(Object.keys(files), read(files)), t).toEqual(['x.sql'])
    }
  })

  it('does not count a menu write inside a rollback comment', () => {
    // Migrations here carry DOWN scripts in comments. A write that cannot run is not a write --
    // the same blind spot check-grants.mjs hit with a commented-out DROP TABLE (ADR-965).
    const files = {
      'a.sql': "-- ROLLBACK:\n-- delete from menu_items where id = 1;\ncreate table x (id int);",
      'b.sql': "/* down:\n  insert into menus (label) values ('X');\n*/\ncreate table y (id int);",
    }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })

  it('ignores a migration that does not touch menus at all', () => {
    const files = { 'a.sql': 'create table profiles (id uuid);' }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })

  it('does not match a table that merely starts with a menu table name', () => {
    // `menu_items_archive` is a different table; the word boundary is what keeps this honest.
    const files = { 'a.sql': 'insert into menu_items_archive (a) values (1);' }
    expect(menuWritesMissingNote(Object.keys(files), read(files))).toEqual([])
  })
})

describe('stripSqlComments', () => {
  it('preserves length, so nothing shifts', () => {
    const src = "-- a\ninsert into menu_items (x) values (1);\n/* b */\n"
    expect(stripSqlComments(src)).toHaveLength(src.length)
  })

  it('blanks both comment forms', () => {
    expect(stripSqlComments('-- x\n/* y */')).not.toMatch(/[xy]/)
  })
})
