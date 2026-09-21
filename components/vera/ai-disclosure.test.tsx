// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AiDisclosure, AI_DISCLOSURE } from './ai-disclosure'
import { SparkReview } from '@/components/studio/spark/spark-review'
import type { FieldModel, FieldState } from '@/lib/studio/kernel/review-kernel'

// The Article 50 line (OWN-061, ADR-1515). Three things are worth a test, and none of them is
// "the component renders": that the sentence is a legal disclosure in the product voice (plain,
// no em dash), that EVERY member-facing Vera surface carries it (a disclosure typed inline in one
// surface is the state this file replaced), and that the board-level line on the Studio review
// board is tied to whether anything on the board was generated, which is a runtime fact.

/**
 * The surfaces that render Vera output to a member. Adding a surface means adding a row here;
 * a surface that stops rendering her output leaves. The list is the contract, the grep proves it.
 */
const VERA_SURFACES = [
  'components/vera/vera-chat.tsx', // the persistent companion + launcher
  'components/onboarding/vera-lightbox.tsx', // the onboarding conversation
  'components/studio/spark/spark-review.tsx', // every Studio wizard's generated fields
  'components/on-air/reveal.tsx', // the daily Dispatch from Vera
  'components/events/events-for-you.tsx', // the per-event blurbs on /events
  'app/(main)/drafts/draft-row.tsx', // proposals she drew up on /drafts
  'components/circles/builder/circle-vera-panel.tsx', // "Build with Vera" in the Circle builder
]

/** Comment-blind, the way the repo's probes read source: a mention in prose does not count. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function mount(node: React.ReactNode): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('the sentence', () => {
  it('names Vera as AI in every kind, and the copy kind says she wrote it', () => {
    expect(AI_DISCLOSURE.chat).toMatch(/^Vera is AI\./)
    expect(AI_DISCLOSURE.copy).toMatch(/^Vera is AI, and she wrote this\./)
  })

  it('obeys the voice canon: no em dash, one plain sentence per kind', () => {
    for (const text of Object.values(AI_DISCLOSURE)) {
      expect(text, 'em dashes are banned in member-facing copy').not.toContain('—')
      expect(text.trim().split(/(?<=\.)\s+/), 'one sentence, not a paragraph').toHaveLength(1)
    }
  })

  it('renders as a note, carries the kind as data, and appends a detail after the disclosure', () => {
    mount(<AiDisclosure kind="chat" detail="She points you toward your people." />)
    const note = document.querySelector('[role="note"][data-ai-disclosure="chat"]')
    expect(note).not.toBeNull()
    expect(note!.textContent).toBe('Vera is AI. She points you toward your people.')
  })
})

describe('every member-facing Vera surface carries it', () => {
  for (const file of VERA_SURFACES) {
    it(`${file} imports and renders <AiDisclosure>`, () => {
      const source = stripComments(readFileSync(join(process.cwd(), file), 'utf8'))
      expect(source).toMatch(/from\s+['"]@\/components\/vera\/ai-disclosure['"]/)
      expect(source).toMatch(/<AiDisclosure\b/)
    })
  }
})

describe('the Studio review board discloses only when something on it was generated', () => {
  function field(overrides: Partial<FieldState>): FieldState {
    return {
      path: 'title',
      label: 'Name',
      kind: 'text',
      section: 'basics',
      placement: 'spark',
      value: 'Tuesday walk',
      signal: 'green',
      generated: false,
      commercial: false,
      withheld: false,
      blocksApply: false,
      editable: true,
      changed: false,
      ...overrides,
    } as FieldState
  }

  function model(fields: FieldState[]): FieldModel {
    return {
      sections: [{ key: 'basics', title: 'Basics', desc: 'The essentials.', fields }],
      summary: { total: fields.length, green: fields.length, amber: 0, red: 0, withheld: 0, blocked: false },
    }
  }

  it('a board with a Vera-written field shows the line once, above the rows', () => {
    mount(<SparkReview model={model([field({ generated: true }), field({ path: 'blurb', label: 'Blurb', generated: true })])} onEdit={() => {}} />)
    const notes = document.querySelectorAll('[data-ai-disclosure="copy"]')
    expect(notes, 'once per board, not once per row').toHaveLength(1)
    expect(notes[0].textContent).toContain('Vera is AI, and she wrote this.')
  })

  it('a board the author typed entirely has nothing to disclose', () => {
    mount(<SparkReview model={model([field({})])} onEdit={() => {}} />)
    expect(document.querySelector('[data-ai-disclosure]')).toBeNull()
  })
})
