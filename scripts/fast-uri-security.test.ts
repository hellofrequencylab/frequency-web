import { createRequire } from 'node:module'
import { readdirSync, realpathSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { verifyEncodedScheme, verifyHostCanonicalization, verifyRelativeReferences, verifySuffixColon } from './lib/fast-uri-security.mjs'

// Resolve through the installed schema-utils -> Ajv consumer, not a substitute parser.
const store = resolve('node_modules/.pnpm')
const consumers = readdirSync(store).filter(name => /^schema-utils@4\./.test(name))
if (consumers.length !== 1) throw new Error(`Expected one actual schema-utils4 consumer, found ${consumers.length}`)
const schemaRequire = createRequire(realpathSync(join(store, consumers[0], 'node_modules/schema-utils/package.json')))
const ajvRequire = createRequire(schemaRequire.resolve('ajv/package.json'))
const uri = ajvRequire('fast-uri')
const Ajv = schemaRequire('ajv')

describe('patched fast-uri in the actual Ajv consumer', () => {
  it('resolves the reviewed compatible patch', () => { expect(ajvRequire('fast-uri/package.json').version).toBe('3.1.9') })
  it('rejects encoded schemes', () => verifyEncodedScheme(uri))
  it('reports malformed authorities', () => verifyHostCanonicalization(uri))
  it('preserves relative-reference resolution', () => verifyRelativeReferences(uri))
  it('escapes relative suffix colons', () => verifySuffixColon(uri))
  it('still resolves relative schema IDs and rejects invalid referenced data', () => {
    const ajv = new Ajv({ strict: true })
    ajv.addSchema({ $id: 'https://fixture.invalid/schema/address.json', type: 'object', properties: { zip: { type: 'string', pattern: '^[0-9]{5}$' } }, required: ['zip'], additionalProperties: false })
    const validate = ajv.compile({ $id: 'https://fixture.invalid/schema/person.json', type: 'object', properties: { address: { $ref: './address.json' } }, required: ['address'], additionalProperties: false })
    expect(validate({ address: { zip: '92024' } })).toBe(true)
    expect(validate({ address: { zip: 'invalid' } })).toBe(false)
    expect(validate({ address: {} })).toBe(false)
    expect(validate({ address: { zip: '92024', secret: true } })).toBe(false)
    expect(() => ajv.compile({ $ref: 'https://fixture.invalid/schema/missing.json' })).toThrow()
  })
})
