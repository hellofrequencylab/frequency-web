import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkNodeDocumentSafety, documentProblems, integrityProblems } from './check-node-document-safety.mjs'
import { upgradeLayout, allNodes, type NodeLayout } from '../lib/entity-blocks/node-tree'

const corpusPath = 'scripts/entity-layout-corpus.json'
const fixturePath = 'scripts/fixtures/node-document-safety/unknown-nested.json'
const manifest = JSON.parse(readFileSync('scripts/node-document-safety-manifest.json', 'utf8'))
const read = (file: string) => readFileSync(file, 'utf8')
const fixture = () => JSON.parse(read(fixturePath))
const mutate = (change: (doc: NodeLayout) => void) => (input: unknown) => {
  const doc = upgradeLayout(input)
  if (doc) change(doc)
  return doc
}

describe('node document safety gate', () => {
  it('runs the real pinned structural archive and adversarial fixture', () => {
    expect(checkNodeDocumentSafety()).toEqual([])
  })

  it('does not accept a recaptured corpus without a reviewed hash', () => {
    expect(integrityProblems(manifest, (file: string) => file === corpusPath ? read(file) + ' ' : read(file), ['unknown-nested.json'])).toContain(`${corpusPath}: sha256 changed; recapture with reason`)
  })

  it('fails missing input, orphan fixture and an empty input manifest', () => {
    expect(integrityProblems(manifest, () => { throw new Error('missing') }, ['orphan.json']).join('\n')).toContain('missing input')
    expect(integrityProblems(manifest, read, ['orphan.json']).join('\n')).toContain('orphan fixture')
    expect(integrityProblems({ ...manifest, inputs: [] }, read, []).join('\n')).toContain('manifest inputs missing')
  })

  it('does not permit a fixture path to leave the declared scope', () => {
    const outside = { ...manifest, inputs: [...manifest.inputs, { ...manifest.inputs[1], path: 'scripts/fixtures/node-document-safety/../other.json' }] }
    expect(integrityProblems(outside, read, ['unknown-nested.json']).join('\n')).toContain('outside fixture scope')
  })

  it('detects deleted unknown authored bytes, including nested bytes', () => {
    const lossy = mutate((doc) => {
      const node = allNodes(doc).find((n) => n.type === 'unknown-retired-type')!
      node.content = { text: 'normalized away' }
    })
    expect(documentProblems(fixture(), lossy)).toContain('unknown-retired-type.content: authored bytes lost')
  })

  it('detects lost stored bench content and style', () => {
    const lossy = mutate((doc) => { doc.bench = [] })
    expect(documentProblems(fixture(), lossy)).toContain('unknown-benched-type.content: authored bytes lost')
    expect(documentProblems(fixture(), lossy)).toContain('unknown-benched-style.style: authored bytes lost')
  })

  it('detects removal of a duplicate placement even when all content survives', () => {
    const dedupe = mutate((doc) => { doc.rows[0].cells[0] = doc.rows[0].cells[0].filter((node, index) => index !== 2) })
    expect(documentProblems(fixture(), dedupe)).toContain('placement types or duplicates were lost or reordered')
  })

  it('detects identity collision, mutation and nondeterministic identity', () => {
    expect(documentProblems(fixture(), mutate((doc) => { for (const n of allNodes(doc)) n.nid = 'nabcdef' }))).toContain('unstable or duplicate node ids')
    const raw = fixture()
    expect(documentProblems(raw, (input: unknown) => { (input as Record<string, unknown>).template = 'mutated'; return upgradeLayout(input) })).toContain('upgrade mutated its input')
    let next = 0
    expect(documentProblems(fixture(), mutate((doc) => { doc.rows[0].cells[0][0].nid = `nabcdef${next++}` }))).toContain('node ids are not deterministic')
  })
})
