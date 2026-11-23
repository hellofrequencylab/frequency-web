// A HAND-RUN READING: how many tokens is the part of Vera's request that is meant to be cached?
//
// Her tools and the stable half of her system prompt carry a cache marker (ADR-1287). The provider
// keeps a marked prefix only when it clears a per-model minimum, and a shorter one is billed in
// full on every turn with no error. This asks the provider's token counting endpoint for the real
// size of that prefix, for each tool set a turn can send, and prints it beside the minimum.
//
// Run it by hand, with a key, from the repo root:
//   ANTHROPIC_API_KEY=... node scripts/vera-prefix-tokens.mjs            (the default tier)
//   ANTHROPIC_API_KEY=... node scripts/vera-prefix-tokens.mjs --tier sonnet
//   node scripts/vera-prefix-tokens.mjs --dry                            (no key, no network)
// It goes through the gateway when AI_GATEWAY_URL is set, like every other call (lib/ai/client.ts).
//
// NEVER in CI and never in the build: it is in no package.json script and no workflow. Counting
// tokens is free of charge, but it is a network call with a secret, and a reading is evidence for
// a person to record (on the PROG-E8 row), not a gate. `--dry` and the PROG-E8D probe use the same
// code with no network at all.
//
// The prefix is built by lib/ai/vera/cached-prefix.ts from the functions the live turn calls. The
// hooks below only let node load the repo's TypeScript (the `@/` alias, extensionless imports) and
// replace `server-only`, which exists to break a client bundle and has no meaning here.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TIERS = ['haiku', 'sonnet', 'opus']

let hooked = false
function hookTypeScript() {
  if (hooked) return
  hooked = true
  const exists = (file) => fs.existsSync(file) && fs.statSync(file).isFile()
  const sourceFile = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(exists)
  registerHooks({
    resolve(spec, context, next) {
      if (spec === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }
      const from = context.parentURL?.startsWith('file:') ? path.dirname(fileURLToPath(context.parentURL)) : root
      const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : spec.startsWith('.') ? path.resolve(from, spec) : null
      const file = base && !base.includes(`${path.sep}node_modules${path.sep}`) ? sourceFile(base) : null
      return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(spec, context)
    },
    load(url, context, next) {
      if (!url.startsWith('file:') || !/\.tsx?$/.test(url) || url.includes('/node_modules/')) return next(url, context)
      const file = fileURLToPath(url)
      const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    },
  })
}

/** The shipped prefix module, loaded as it is. */
export async function loadPrefixModule() {
  hookTypeScript()
  return import(pathToFileURL(path.join(root, 'lib/ai/vera/cached-prefix.ts')).href)
}

/** What can be said about the prefix with no network: its size in bytes and a fingerprint that
 *  changes when any byte of it does. */
export function describePrefix(mod, access) {
  const bytes = Buffer.from(JSON.stringify(mod.veraCachedPrefix(access)), 'utf8')
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

/** One reading: two calls to the token counting endpoint (the prefix with a one-word message, and
 *  that message alone), turned into the answer by the shipped `veraPrefixReading`. `client` is the
 *  SDK client; a probe hands in a recorder instead. */
export async function takeReading(client, mod, tier, access) {
  const requests = mod.veraPrefixCountRequests(tier, access)
  const withPrefix = await client.messages.countTokens(requests.withPrefix, { maxRetries: 0 })
  const messageOnly = await client.messages.countTokens(requests.messageOnly, { maxRetries: 0 })
  return mod.veraPrefixReading(tier, { withPrefix: withPrefix.input_tokens, messageOnly: messageOnly.input_tokens })
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const mod = await loadPrefixModule()
  const { DEFAULT_VERA_CONFIG } = await import(pathToFileURL(path.join(root, 'lib/ai/vera/config.ts')).href)
  const tier = args.includes('--tier') ? args[args.indexOf('--tier') + 1] : DEFAULT_VERA_CONFIG.tier
  if (!TIERS.includes(tier)) {
    console.error(`--tier must be one of ${TIERS.join(', ')}`)
    process.exit(2)
  }

  if (dry) {
    console.log(`Vera's cached prefix, no network (tier ${tier}). Bytes and fingerprint only, not tokens.`)
    for (const { name, access } of mod.VERA_PREFIX_VARIANTS) {
      const d = describePrefix(mod, access)
      console.log(`  ${name}: ${d.bytes} bytes, sha256 ${d.sha256.slice(0, 16)}`)
    }
    return
  }

  const { getAnthropic } = await import(pathToFileURL(path.join(root, 'lib/ai/client.ts')).href)
  const client = getAnthropic()
  if (!client) {
    console.error('No key. Set ANTHROPIC_API_KEY (or AI_GATEWAY_URL with its key), or pass --dry for the offline description.')
    process.exit(2)
  }

  console.log(`Vera's cached prefix, counted by the provider (tier ${tier}, ${new Date().toISOString().slice(0, 10)}).`)
  let short = 0
  for (const { name, access } of mod.VERA_PREFIX_VARIANTS) {
    const r = await takeReading(client, mod, tier, access)
    const d = describePrefix(mod, access)
    if (!r.cached) short++
    console.log(
      `  ${name}: ${r.prefixTokens} tokens, minimum ${r.floor}, ${r.cached ? `clears it by ${r.margin}` : `SHORT by ${-r.margin}: this prefix is not cached`} (${d.bytes} bytes, sha256 ${d.sha256.slice(0, 16)})`,
    )
  }
  console.log(short ? `${short} tool set(s) are under the minimum.` : 'Every tool set clears the minimum.')
  console.log('Record the reading and its date on the PROG-E8 row. The exit code is 0 either way: this is a reading, not a gate.')
}

if (invokedDirectly(import.meta.url)) await main()
