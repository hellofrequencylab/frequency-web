import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  loadCategoriesFromDisk,
  selectCategories,
  searchIndexFrom,
  helpHref,
} from './content-core'

// THE DEPENDENCY RULE, AND WHY IT IS A TEST RATHER THAN A COMMENT.
//
// `help-index.yml` re-embeds the help centre into `help_chunks` on every merge to main touching
// `content/help/**`, and it runs with NO `pnpm install` on purpose — the pipeline reads local
// Markdown with `fs` and embeds over HTTP. `lib/help/content.ts` later gained
// `import { cache } from 'react'`, and from that moment the indexer died on ERR_MODULE_NOT_FOUND
// before doing any work. It failed on EVERY push to main from at least 2026-08-13 to 2026-08-18
// while every gate stayed green, because the help PAGES render straight from Markdown — only AI
// search went stale, and stale search is indistinguishable from search.
//
// A comment saying "keep this dependency-free" is what content.ts already had, in spirit, and it
// did not survive one perf optimisation. This does.

describe('content-core imports node builtins and nothing else', () => {
  const SRC = readFileSync(join(process.cwd(), 'lib', 'help', 'content-core.ts'), 'utf8')

  /** Every module specifier in an `import … from` / `export … from` position.
   *
   *  Line-aware on purpose. The obvious version — strip `/*…*\/` with a regex, then strip `//`
   *  lines — reported ZERO imports for this very file, because the banner above writes the path
   *  `content/help/` + a glob, and the `/**` inside that prose opened a block comment that ran to
   *  the first `*\/` further down, eating both real imports on the way. A gate that reads "no
   *  forbidden imports" when it means "I could not find any imports" is the failure this whole
   *  file exists to prevent, so: strip `//` from a line BEFORE looking for `/*` on it, and track
   *  block state across lines rather than with one greedy pattern. */
  function specifiers(src: string): string[] {
    const out: string[] = []
    let inBlock = false
    for (const raw of src.split(/\r?\n/)) {
      let line = raw
      if (inBlock) {
        const end = line.indexOf('*/')
        if (end === -1) continue
        line = line.slice(end + 2)
        inBlock = false
      }
      const slashes = line.indexOf('//')
      if (slashes !== -1) line = line.slice(0, slashes)
      const open = line.indexOf('/*')
      if (open !== -1) {
        const close = line.indexOf('*/', open + 2)
        if (close === -1) {
          inBlock = true
          line = line.slice(0, open)
        } else {
          line = line.slice(0, open) + line.slice(close + 2)
        }
      }
      const m = line.match(/\bfrom\s+['"]([^'"]+)['"]/)
      if (m) out.push(m[1])
    }
    return out
  }

  it('detects specifiers, and is not fooled by one named only in a comment', () => {
    expect(specifiers("import { cache } from 'react'")).toEqual(['react'])
    expect(specifiers("// import { cache } from 'react'\nimport x from 'node:fs'")).toEqual([
      'node:fs',
    ])
    expect(specifiers("/* from 'react' */\nimport x from 'node:path'")).toEqual(['node:path'])
    // a multi-line block comment does not swallow the import that follows it
    expect(specifiers("/*\n from 'react'\n*/\nimport x from 'node:path'")).toEqual(['node:path'])
  })

  it("a glob in a // comment does not open a block comment and eat the imports", () => {
    // The exact shape that made this return [] on first run: `content/help/**` in prose.
    const fixture = [
      '// re-embeds everything under content/help/** on merge',
      "import { promises as fs } from 'fs'",
      "import path from 'path'",
      '/** a real doc comment */',
      'export const x = 1',
    ].join('\n')
    expect(specifiers(fixture)).toEqual(['fs', 'path'])
  })

  it('imports only node builtins — no react, no next, no node_modules at all', () => {
    // `node:`-prefixed or relative. The prefix is required rather than merely allowed: a bare
    // `fs` is a builtin today and a package someone installs tomorrow, and the whole point here is
    // that this file's resolution must not depend on node_modules existing.
    const offenders = specifiers(SRC).filter((s) => !/^node:/.test(s) && !/^\.{1,2}\//.test(s))
    expect(
      offenders,
      `lib/help/content-core.ts must import node builtins only; found: ${offenders.join(', ')}.\n` +
        'help-index.yml runs this file with NO pnpm install, so anything from node_modules kills\n' +
        'the AI-search re-index silently — the help pages keep rendering either way. Put whatever\n' +
        'needs the dependency in lib/help/content.ts, which composes this module. ADR-1078.',
    ).toEqual([])
  })

  it('finds at least one specifier, so a rewrite cannot green this over nothing', () => {
    expect(specifiers(SRC).length).toBeGreaterThan(0)
  })
})

describe('the core still reads the real help centre', () => {
  it('loads categories and articles from content/help', async () => {
    const cats = await loadCategoriesFromDisk()
    expect(cats.length).toBeGreaterThan(3)
    expect(cats.flatMap((c) => c.articles).length).toBeGreaterThanOrEqual(25)
  })

  it('selectCategories drops drafts by default and keeps them when asked', async () => {
    const all = await loadCategoriesFromDisk()
    const published = selectCategories(all)
    const withDrafts = selectCategories(all, { includeDrafts: true })
    expect(published.flatMap((c) => c.articles).every((a) => a.status === 'published')).toBe(true)
    expect(withDrafts.flatMap((c) => c.articles).length).toBeGreaterThanOrEqual(
      published.flatMap((c) => c.articles).length,
    )
    // and it never mutates what it was handed
    expect(all.flatMap((c) => c.articles).length).toBeGreaterThanOrEqual(
      withDrafts.flatMap((c) => c.articles).length,
    )
  })

  it('searchIndexFrom yields one entry per published article, each with an href and excerpt', async () => {
    const cats = selectCategories(await loadCategoriesFromDisk())
    const index = searchIndexFrom(cats)
    expect(index.length).toBe(cats.flatMap((c) => c.articles).length)
    for (const e of index.slice(0, 5)) {
      expect(e.href).toBe(helpHref(e.category, e.href.split('/').pop()!))
      expect(e.excerpt.length).toBeLessThanOrEqual(160)
    }
  })
})
