import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { emailConsequences } from './probes/lifecycle-copy.mjs'

const root = process.cwd()
const emailSource = readFileSync('lib/email.ts', 'utf8')

describe('bounded lifecycle probe loading', () => {
  it('retains the actual source consequences after compilation moves outside VM execution', async () => {
    const result = await emailConsequences(root)
    expect(result.cases).toBe(36)
    expect(Object.entries(result.closure)).toContainEqual(['lib/email.ts', expect.stringMatching(/^[a-f0-9]{64}$/)])
  })

  it('still times out an actual infinite module body at the unchanged VM deadline', async () => {
    await expect(emailConsequences(root, { 'lib/email.ts': emailSource + '\nwhile (true) {}' }))
      .rejects.toMatchObject({ code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' })
  })

  it('still refuses an import outside the reviewed source and inert dependency set', async () => {
    await expect(emailConsequences(root, { 'lib/email.ts': "import 'unreviewed-provider-fixture'\n" + emailSource }))
      .rejects.toThrow('Unexpected package import:unreviewed-provider-fixture')
  })
})
