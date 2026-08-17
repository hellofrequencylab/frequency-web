import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { gatedSlugs, parseLedger, MIN_SLUGS } from '../../../scripts/check-render-path.mjs'

// Every registered marketing template must be renderable by the CURRENT block
// config. A template that composes a retired or unregistered block type fails
// `isRenderable`, and the route silently falls back to the legacy coded page —
// exactly the invisible regression the DAWN 2 conversion existed to close
// (ADR-926). This guard turns that silence into a red test.
//
// ⚠️ 2026-08-17 (Lift 5c, ADR-1068): the slug list is no longer typed out here. It is READ from
// `EDITABLE_PAGES` with the same parser `check:render-path` uses, because a hand-typed list makes
// this gate silently partial the moment a slug joins the editor — and a slug can now join with NO
// coded body behind it. For a retired slug (`about`, `circles`) the template is the LAST rung: if
// it stopped resolving there is nothing to fall back to and the route renders a blank page. So the
// coverage has to follow the constant, not a copy of it.

const slugs = gatedSlugs(readFileSync(resolve(process.cwd(), 'lib/page-editor/data.ts'), 'utf8'))
const ledger = parseLedger(readFileSync(resolve(process.cwd(), 'scripts/render-path-bodies.txt'), 'utf8')).entries

describe('regenerated templates are renderable by the current config', () => {
  it('parsed a real slug list, so silence means something (the non-triviality floor)', () => {
    // `gatedSlugs()` returns [] the moment its regex stops matching EDITABLE_PAGES, and an empty
    // list means an empty loop and a green gate that checked nothing. Same floor, same reason, as
    // scripts/check-render-path.test.ts. Fix the parser; never lower this.
    expect(slugs.length).toBeGreaterThanOrEqual(MIN_SLUGS)
  })

  for (const slug of slugs) {
    it(slug, () => {
      const data = getTemplate(slug)
      const lastRung = ledger.get(slug)?.count === 0
      expect(
        data,
        lastRung
          ? `\`${slug}\` is TEMPLATE-ONLY (scripts/render-path-bodies.txt says 0 coded components), so ` +
              `lib/page-editor/templates/${slug}.ts is the only thing left that renders it. There is no ` +
              'coded body to fall back to: without this template the route serves a blank page.'
          : `\`${slug}\` is in EDITABLE_PAGES but has no template, so the editor seeds from nothing.`,
      ).toBeTruthy()
      expect(isRenderable(data)).toBe(true)
    })
  }
})
