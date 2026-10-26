import assert from 'node:assert/strict'
import { loadProbeModule } from '../lib/probe-module.mjs'

// Execute the shared production reader with explicit local parser recorders. No file/network SDK.
const instances = []
let text = '  Fixture overview  ', readError, cleanupError, wordReads = 0
class PDFParse {
  constructor({ data }) { this.data = data; this.destroyed = 0; instances.push(this) }
  async getText() { if (readError) throw readError; return { text } }
  async destroy() {
    await Promise.resolve()
    this.destroyed++
    if (cleanupError) throw cleanupError
  }
}
const { extractOverviewText } = loadProbeModule('lib/journeys/extract-text.ts', {
  'server-only': {}, 'pdf-parse': { PDFParse },
  mammoth: { extractRawText: async () => { wordReads++; return { value: '  Word fixture  ' } } },
})
const input = Buffer.from('Synthetic PDF bytes')
assert.equal(await extractOverviewText(input, 'application/pdf', 'overview.pdf'), 'Fixture overview')
assert.equal(instances[0].destroyed, 1, 'Release the parser after successful extraction')
assert.ok(instances[0].data instanceof Uint8Array)
assert.notEqual(instances[0].data.buffer, input.buffer, 'Retain caller ownership of uploaded bytes')

text = ''
assert.equal(await extractOverviewText(input, '', 'OVERVIEW.PDF'), '')
assert.equal(instances[1].destroyed, 1, 'Release an empty PDF as well')

readError = new Error('Synthetic parser read failure')
await assert.rejects(extractOverviewText(input, 'application/pdf', 'broken.pdf'), error => error === readError)
assert.equal(instances[2].destroyed, 1, 'Release a parser when extraction fails')
readError = undefined

cleanupError = new Error('Synthetic cleanup failure')
await assert.rejects(extractOverviewText(input, 'application/pdf', 'cleanup.pdf'), error => error === cleanupError)
assert.equal(instances[3].destroyed, 1, 'Await cleanup rather than floating or swallowing its rejection')
cleanupError = undefined

assert.equal(await extractOverviewText(Buffer.from('  Plain fixture  '), 'text/plain', 'overview.txt'), 'Plain fixture')
assert.equal(await extractOverviewText(input, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'overview.docx'), 'Word fixture')
assert.equal(wordReads, 1)
assert.equal(instances.length, 4, 'Non-PDF files do not create PDF parser resources')
console.log('Actual shared upload reader releases PDF parsers after success, empty output and read failure, awaits cleanup, preserves input ownership and leaves text/Word paths intact. Synthetic parsers only.')
