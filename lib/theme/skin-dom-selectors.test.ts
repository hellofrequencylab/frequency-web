// @vitest-environment jsdom
//
// LIVE-008 — a skin's dark block must MATCH the element the skin attribute is actually on.
//
// The neighbouring skins.test.ts asserts each skin has a dark block by grepping globals.css for
// the words `.dark [data-skin="<id>"]`. That is shape, not truth: a selector can be present and
// still match NOTHING. `data-skin` lands on <html> ITSELF on the preview path (app/layout.tsx's
// pre-paint script writes localStorage `freq-skin` onto documentElement; test/e2e/surfaces.ts
// stamps the render states the same way), and a DESCENDANT combinator cannot match an element
// against itself — so `.dark [data-skin="midnight"]` alone silently no-opped there and midnight
// dark painted the generic `.dark` palette with midnight's LIGHT feel underneath it.
//
// This file measures the consequence instead: it feeds the real selectors from the real sheet to
// a real selector engine, against BOTH DOM shapes the app produces. It is deliberately generic —
// every registered skin is checked, so a new skin cannot ship with a half-matching dark block.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SKINS, DEFAULT_SKIN } from './skins'

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const GLOBALS_CSS = read('../../app/globals.css')
const ROOT_LAYOUT = read('../../app/layout.tsx')
const E2E_SURFACES = read('../../test/e2e/surfaces.ts')

/** Rule preludes in source order: the text between the previous block/statement and the next `{`. */
function preludes(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...withoutComments.matchAll(/(?:^|[};])\s*([^{}@;]+?)\s*\{/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim(),
  )
}

/** The dark block's selector LIST for one skin, split into its independent selectors. */
function darkSkinSelectors(id: string): string[] {
  return preludes(GLOBALS_CSS)
    .filter((p) => p.includes(`[data-skin="${id}"]`) && p.includes('.dark'))
    .flatMap((p) => p.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
}

/** `<html class="dark" data-skin="<id>">` — the preview / e2e path: BOTH axes on one element. */
function skinOnHtml(id: string): Element {
  const doc = document.implementation.createHTMLDocument('skin')
  doc.documentElement.className = 'dark'
  doc.documentElement.setAttribute('data-skin', id)
  return doc.documentElement
}

/** `<html class="dark"> … <div data-skin="<id>">` — the authed shell / Spotlight / preview-strip path. */
function skinOnDescendant(id: string): Element {
  const doc = document.implementation.createHTMLDocument('skin')
  doc.documentElement.className = 'dark'
  const shell = doc.createElement('div')
  shell.setAttribute('data-skin', id)
  doc.body.appendChild(shell)
  return shell
}

describe('the premise: data-skin really does land on <html> as well as on a descendant', () => {
  it('the pre-paint script stamps the freq-skin preview onto documentElement', () => {
    expect(ROOT_LAYOUT).toMatch(/documentElement\.setAttribute\(\s*'data-skin'\s*,\s*skin\s*\)/)
  })

  it('the e2e render-state harness stamps the skin onto documentElement too', () => {
    expect(E2E_SURFACES).toMatch(/documentElement[\s\S]{0,400}setAttribute\(\s*'data-skin'/)
  })

  it('the authed shell stamps it on the shell root instead', () => {
    expect(read('../../components/layout/app-shell.tsx')).toMatch(/data-skin=\{skin\}/)
  })
})

describe('every skin dark block matches BOTH places the skin attribute lands', () => {
  for (const skin of SKINS) {
    if (skin.id === DEFAULT_SKIN) continue // inherits :root/.dark; no overrides to match

    describe(`skin: ${skin.id}`, () => {
      it('authors at least one dark-mode selector', () => {
        expect(darkSkinSelectors(skin.id).length).toBeGreaterThan(0)
      })

      it('matches <html class="dark" data-skin> — the preview / e2e path', () => {
        const selectors = darkSkinSelectors(skin.id)
        const el = skinOnHtml(skin.id)
        const matching = selectors.filter((s) => el.matches(s))
        expect(
          matching,
          `No selector in the dark block for "${skin.id}" matches <html class="dark" ` +
            `data-skin="${skin.id}">. Authored: ${selectors.join(' | ')}. A descendant ` +
            `combinator cannot match an element against itself — add the compound form ` +
            `.dark[data-skin="${skin.id}"] to the selector list in app/globals.css.`,
        ).not.toHaveLength(0)
      })

      it('matches a shell root under <html class="dark"> — the authed-shell path', () => {
        const selectors = darkSkinSelectors(skin.id)
        const el = skinOnDescendant(skin.id)
        const matching = selectors.filter((s) => el.matches(s))
        expect(
          matching,
          `No selector in the dark block for "${skin.id}" matches a [data-skin] shell root ` +
            `under <html class="dark">. Authored: ${selectors.join(' | ')}. Keep the ` +
            `descendant form .dark [data-skin="${skin.id}"] in the selector list.`,
        ).not.toHaveLength(0)
      })

      it('does not leak into light mode on either path', () => {
        const selectors = darkSkinSelectors(skin.id)
        const doc = document.implementation.createHTMLDocument('light')
        doc.documentElement.setAttribute('data-skin', skin.id)
        const nested = doc.createElement('div')
        nested.setAttribute('data-skin', skin.id)
        doc.body.appendChild(nested)
        for (const el of [doc.documentElement, nested]) {
          expect(selectors.filter((s) => el.matches(s))).toHaveLength(0)
        }
      })
    })
  }
})
