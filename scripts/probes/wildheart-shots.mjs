// WILDHEART FIDELITY SHOTS (LIVE-903). Renders the Wildheart site offline and screenshots every page at
// 1440 and 390 wide beside the design handoff's screens, so a pass is proven with pixels, not prose.
//
//   WILDHEART_SHOTS_DIR=<out dir> [WILDHEART_HANDOFF=<handoff dir>] node scripts/probes/wildheart-shots.mjs
//
// Step 1 runs the render harness (test/wildheart-site.render.test.tsx) with WILDHEART_SHOTS_DIR set, which
// writes <out>/site/<page>.html: the seed's page docs through the real chrome and section renderer, the
// skin inlined, the faces loaded from public/fonts and Google Fonts. Step 2 serves <out>/site, public/ and
// the handoff folder from one local static server. Step 3 drives the pre-installed Chromium
// (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers, never `playwright install`) over every page and, when the
// handoff folder is given, over each of its six screens (Home, The program, The year, Circles, Retreat,
// About), writing <out>/<page>-<width>.png and <out>/handoff-<screen>-<width>.png.
//
// Not a ledger probe: it spawns the test runner (LIVE-034 keeps those out of verify.cmd). The row's probe
// is scripts/probes/wildheart-fidelity.mjs, which measures the rendered consequences in-process.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const out = process.env.WILDHEART_SHOTS_DIR
if (!out) {
  console.error('WILDHEART_SHOTS_DIR is required')
  process.exit(2)
}
const handoff = process.env.WILDHEART_HANDOFF ? resolve(process.env.WILDHEART_HANDOFF) : null
const widths = (process.env.WILDHEART_WIDTHS ?? '1440,390').split(',').map(Number)
const only = process.env.WILDHEART_ONLY ? new Set(process.env.WILDHEART_ONLY.split(',')) : null
mkdirSync(join(out, 'site'), { recursive: true })

// 1. Render.
const render = spawnSync('pnpm', ['vitest', 'run', 'test/wildheart-site.render.test.tsx'], { stdio: 'inherit', env: { ...process.env, WILDHEART_SHOTS_DIR: out, CI: '1' } })
if (render.status !== 0) console.error('render harness reported failures (pages that rendered are still shot)')

// 2. Serve.
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/plain' }
const roots = [join(out, 'site'), resolve('public')]
function fileFor(url) {
  const path = decodeURIComponent(new URL(url, 'http://x').pathname)
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '')
  if (handoff && safe.startsWith('/handoff/')) {
    const f = join(handoff, safe.slice('/handoff/'.length))
    return existsSync(f) && statSync(f).isFile() ? f : null
  }
  for (const root of roots) {
    const f = join(root, safe === '/' ? '/home.html' : safe)
    if (existsSync(f) && statSync(f).isFile()) return f
  }
  return null
}
const server = createServer((req, res) => {
  const f = fileFor(req.url ?? '/')
  if (!f) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

// 3. Shoot.
const { chromium } = await import('@playwright/test')
const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined })
const pages = ['home', 'program', 'the-year', 'circles', 'retreat', 'about', 'foundation', 'safety', 'host'].filter((p) => existsSync(join(out, 'site', `${p}.html`)) && (!only || only.has(p)))
const shots = []
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true, reducedMotion: 'no-preference' })
  for (const slug of pages) {
    const page = await ctx.newPage()
    page.setDefaultTimeout(20000)
    console.error(`site ${width}: ${slug}`)
    await page.goto(`${base}/${slug}.html`, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    // Lazy images below the fold only load once scrolled to: walk the page, then let them settle.
    await page.evaluate(async () => {
      for (const img of document.querySelectorAll('img')) img.loading = 'eager'
      const h = document.body.scrollHeight
      for (let y = 0; y < h; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) }
      window.scrollTo(0, 0)
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r }))))
    })
    await page.waitForTimeout(400)
    const file = join(out, `${slug}-${width}.png`)
    await page.screenshot({ path: file, fullPage: true })
    shots.push(file)
    await page.close()
  }
  if (handoff && existsSync(join(handoff, 'Website.html'))) {
    const page = await ctx.newPage()
    page.setDefaultTimeout(15000)
    console.error(`handoff ${width}: loading`)
    // The handoff loads React 18 and Babel from unpkg, which the sandbox cannot reach; WILDHEART_VENDOR names
    // a folder holding react.js, react-dom.js and babel.js (npm pack react@18.3.1 react-dom@18.3.1
    // @babel/standalone@7.29.0) and the route serves those instead.
    const vendor = process.env.WILDHEART_VENDOR
    if (vendor) {
      await page.route(/unpkg\.com/, (route) => {
        const u = route.request().url()
        const f = /react-dom@/.test(u) ? 'react-dom.js' : /react@/.test(u) ? 'react.js' : /babel/.test(u) ? 'babel.js' : null
        if (f && existsSync(join(vendor, f))) route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(join(vendor, f)) })
        else route.abort()
      })
    }
    await page.goto(`${base}/handoff/Website.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(6000)
    const screens = [['home', 'Home'], ['program', 'The program'], ['year', 'The year'], ['circles', 'Circles'], ['retreat', 'Retreat'], ['about', 'About']]
    for (const [key, label] of screens) {
      if (only && !only.has(`handoff-${key}`) && !only.has('handoff')) continue
      if (width >= 720) {
        const frames = page.frames()
        let clicked = false
        for (const f of frames) {
          const btn = f.getByRole('button', { name: new RegExp(`^${label}$|^${label.replace('The ', '')}$`) }).first()
          if (await btn.count()) {
            await btn.click().catch(() => {})
            clicked = true
            break
          }
        }
        if (!clicked && key !== 'home') continue
        await page.waitForTimeout(900)
      } else if (key !== 'home') continue
      console.error(`handoff ${width}: ${key}`)
      const file = join(out, `handoff-${key}-${width}.png`)
      await page.screenshot({ path: file, fullPage: true })
      shots.push(file)
    }
    await page.close()
  }
  await ctx.close()
}
await browser.close()
server.close()
console.log(shots.join('\n'))
