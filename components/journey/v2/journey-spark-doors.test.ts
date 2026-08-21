import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MASTER_FRAMEWORK_ID } from '@/lib/journeys/templates'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE JOURNEY'S FOUR DOORS, AND THE ONE STRING THAT CANNOT DRIFT (ADR-1098).
//
// `journey-spark.tsx` re-declares `FRAMEWORK_ID = 'master-framework'` rather than importing
// MASTER_FRAMEWORK_ID, because `lib/journeys/templates.ts` pulls in server-only compose code — the
// same reason the template list arrives as props instead of an import. A copied constant is a
// correct trade only while something notices when the original moves. This is that something.
//
// If they ever diverge, the failure is silent and expensive: picking "The recommended framework"
// would fall through to `createJourneyFromTemplateAction('master-framework')`, which has no such
// template, so the author gets an error instead of a Journey.
//
// The rest is a source-shape check on the owner-specified order. A render test would be better and
// cannot be written here: this component reaches for `useRouter` and five server actions on import.
// Its sibling `components/studio/spark/spark-doors.test.tsx` renders the kit half for real.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SRC = readFileSync('components/journey/v2/journey-spark.tsx', 'utf8')
/** Comments are stripped before every code assertion: a comment that NAMES a retired thing is
 *  documentation, not a call site, and reading it as one is the defect ADR-1097 records three times. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the framework id the Spark copies', () => {
  it('matches MASTER_FRAMEWORK_ID exactly', () => {
    const m = CODE.match(/const FRAMEWORK_ID = '([^']+)'/)
    expect(m?.[1]).toBe(MASTER_FRAMEWORK_ID)
  })
})

describe('screen one', () => {
  it('asks Vera through a prompt field, not a door card', () => {
    expect(CODE).toContain('veraPrompt=')
    expect(CODE).toContain('Tell me about your Journey')
  })

  it('offers exactly one extra door, and it is the template picker', () => {
    const keys = [...CODE.matchAll(/key: '([a-z-]+)',\s*\n\s*label:/g)].map((m) => m[1])
    expect(keys).toEqual(['templates'])
  })

  it('🔴 no longer declares a standalone framework door — it moved into the picker', () => {
    expect(CODE).not.toContain("key: 'framework'")
    expect(CODE).not.toContain('Use the recommended framework')
  })

  it('labels the upload control the way the owner asked', () => {
    expect(CODE).toContain('docLabel="Upload Documents"')
  })
})

describe('the uploader', () => {
  it('🔴 is the kit control, and the bespoke second uploader is gone', () => {
    // The whole point of the consolidation: one button, one file input, one label.
    expect(CODE).not.toContain('function BatchUpload')
    expect(CODE).not.toContain('<BatchUpload')
    expect(CODE).toContain('onDocuments={onFiles}')
  })

  it('still reads a stack of files on the Journey’s own budgeted action', () => {
    expect(CODE).toContain('extractOverviewFilesAction')
  })
})

describe('the framework keeps an author-chosen length', () => {
  it('routes the picker entry to a weeks step rather than straight to creation', () => {
    expect(CODE).toContain("if (id === FRAMEWORK_ID) {")
    expect(CODE).toContain("setStage('framework')")
  })

  it('asks for weeks on that step, then calls the framework action', () => {
    const step = CODE.slice(CODE.indexOf("if (stage === 'framework')"), CODE.indexOf("if (stage === 'source')"))
    expect(step).toContain("askField('answers.weeks')")
    expect(step).toContain('onNext={framework}')
  })

  it('and the action still receives those weeks', () => {
    expect(CODE).toContain('createMasterFrameworkAction({ weeks, spaceSlug })')
  })
})
