import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

// GHSA-rq7h-c2jc-7f22: an in-root import must never authorize its host-absolute twin.
// Both files are disposable synthetic fixtures; no private host files are accessed.
export async function verifyViteFileBoundary() {
  const require = createRequire(import.meta.url)
  const vitePath = createRequire(realpathSync(require.resolve('vitest/package.json'))).resolve('vite')
  const vite = await import(pathToFileURL(vitePath).href)
  const base = realpathSync(await mkdtemp(join(tmpdir(), 'frequency-vite-boundary-')))
  const root = join(base, 'project')
  const outside = join(base, 'host-canary.js')
  let server
  try {
    await mkdir(dirname(root + outside), { recursive: true })
    await writeFile(outside, 'export default "SYNTHETIC-HOST-CANARY"\n')
    await writeFile(root + outside, 'export default "PROJECT-DECOY"\n')
    await writeFile(join(root, 'main.js'), `import ${JSON.stringify('.' + outside)}\n`)
    server = await vite.createServer({
      configFile: false, root, cacheDir: join(base, 'cache'), logLevel: 'silent', appType: 'custom',
      server: { host: '127.0.0.1', port: 0, fs: { strict: true, allow: [root] }, watch: null, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    await server.listen()
    const port = server.httpServer.address().port
    const entry = await fetch(`http://127.0.0.1:${port}/main.js`)
    assert.equal(entry.status, 200, 'Process the in-project import before probing the boundary')
    const response = await fetch(`http://127.0.0.1:${port}/@fs${outside}`)
    assert.equal(response.status, 403, 'Analyzing a project import cannot authorize a host file')
    assert.ok(!(await response.text()).includes('SYNTHETIC-HOST-CANARY'))
    return { version: vite.version, entryStatus: entry.status, outsideStatus: response.status }
  } finally {
    try { await server?.close() } finally { await rm(base, { recursive: true, force: true }) }
  }
}
if (invokedDirectly(import.meta.url)) console.log(JSON.stringify(await verifyViteFileBoundary()))
