import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import axe from 'axe-core'

// A11y harness (meta-scan A+): render a component to static markup, inject it into the
// jsdom document, and run axe-core against it. This guards the ACCESSIBILITY of the shared
// design-system primitives (the layer every page composes from) — a violation here means
// dozens of pages inherit it, so the leaf level is the highest-leverage place to assert.
//
// SCOPE + honesty: jsdom does not compute layout, paint, or resolved styles, so the rules
// that depend on rendered geometry/colour are unreliable there and are disabled below —
// `color-contrast` (needs paint) most notably. These are validated by manual/visual review,
// not this harness. What THIS catches is the large structural set axe evaluates from the DOM
// alone: missing/duplicate form labels, buttons/links without an accessible name, images
// without alt, invalid or orphaned ARIA, bad roles, list structure, and so on.
//
// The isolated-fragment rules (a component is not a whole page) are also disabled: landmark,
// heading-order-of-the-page, html-lang, document-title. Those belong to a full-page audit,
// not a primitive.
const FRAGMENT_DISABLED_RULES = [
  'color-contrast', // needs real layout/paint; jsdom can't compute it
  'region', // "all content in a landmark" — a page rule, not a component one
  'landmark-one-main',
  'page-has-heading-one',
  'html-has-lang',
  'document-title',
  'bypass',
] as const

export interface A11yViolation {
  id: string
  impact: string | null | undefined
  help: string
  nodes: string[]
}

/**
 * Render `ui` and return the axe violations found in it (empty array = accessible).
 * Requires the jsdom test environment (the test file must declare `// @vitest-environment jsdom`).
 */
export async function findA11yViolations(ui: ReactElement): Promise<A11yViolation[]> {
  const html = renderToStaticMarkup(ui)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  try {
    const results = await axe.run(host, {
      resultTypes: ['violations'],
      rules: Object.fromEntries(FRAGMENT_DISABLED_RULES.map((id) => [id, { enabled: false }])),
    })
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.html),
    }))
  } finally {
    host.remove()
  }
}

/** A readable one-line-per-violation message for a failed assertion. */
export function formatViolations(violations: A11yViolation[]): string {
  return violations
    .map((v) => `[${v.impact ?? 'n/a'}] ${v.id} — ${v.help}\n    ${v.nodes.join('\n    ')}`)
    .join('\n')
}
