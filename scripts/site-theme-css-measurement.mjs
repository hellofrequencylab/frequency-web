import { chromium } from '@playwright/test'
import { invokedDirectly } from './lib/invoked-directly.mjs'

const themeAsset = /\/_site-theme-assets\/[a-f0-9]{24}\.css$/
const themeAssetDirectory = '/_site-theme-assets/'

async function visit(page, url, mode) {
  const response = await page.goto(url, { waitUntil: 'load' })
  if (!response?.ok() || page.url() !== new URL(url).href) {
    throw new Error(`Expected a successful response at ${url}, got ${response?.status()} at ${page.url()}`)
  }
  await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint', 'paint').length > 0)
  const { links, resources, htmlBytes, fcpMs } = await page.evaluate((directory) => {
    const navigation = performance.getEntriesByType('navigation')[0]
    return {
      links: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map((link) => new URL(link.href).pathname)
        .filter((path) => path.startsWith(directory)),
      resources: performance.getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).pathname.startsWith(directory))
        .map((entry) => ({
          path: new URL(entry.name).pathname,
          bodyBytes: entry.encodedBodySize,
          transferBytes: entry.transferSize,
        })),
      htmlBytes: navigation.encodedBodySize,
      fcpMs: performance.getEntriesByName('first-contentful-paint', 'paint')[0].startTime,
    }
  }, themeAssetDirectory)

  if (mode === 'linked') {
    if (links.length !== 1 || !themeAsset.test(links[0]) || resources.length !== 1
      || resources[0].path !== links[0] || resources[0].bodyBytes <= 0) {
      throw new Error(`Expected one loaded hashed theme stylesheet at ${url}`)
    }
  } else if (links.length || resources.length) {
    throw new Error(`Unexpected theme stylesheet on the ${mode} route at ${url}`)
  }

  if (htmlBytes <= 0 || fcpMs <= 0) throw new Error(`Missing navigation or paint timings at ${url}`)
  return { htmlBytes, themeTransferBytes: resources[0]?.transferBytes ?? 0, fcpMs }
}

async function sample(browser, url, mode, storageState) {
  const context = await browser.newContext({ storageState })
  try {
    const page = await context.newPage()
    return { first: await visit(page, url, mode), repeat: await visit(page, url, mode) }
  } finally {
    await context.close()
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function summarize(samples, visitType) {
  return {
    htmlBytes: median(samples.map((s) => s[visitType].htmlBytes)),
    themeTransferBytes: median(samples.map((s) => s[visitType].themeTransferBytes)),
    fcpMs: median(samples.map((s) => s[visitType].fcpMs)),
  }
}

export async function measureThemeCss(browser, { inline, linked, member, samples, memberStorageState }) {
  const measured = { inline: [], linked: [] }
  for (let i = 0; i < samples; i++) {
    // Alternate order to reduce the effect of server warm-up and time drift.
    for (const mode of i % 2 ? ['linked', 'inline'] : ['inline', 'linked']) {
      measured[mode].push(await sample(browser, mode === 'inline' ? inline : linked, mode))
    }
  }
  await sample(browser, member, 'member', memberStorageState)
  return {
    samples,
    first: { inline: summarize(measured.inline, 'first'), linked: summarize(measured.linked, 'first') },
    repeat: { inline: summarize(measured.inline, 'repeat'), linked: summarize(measured.linked, 'repeat') },
    memberThemeStylesheet: false,
  }
}

if (invokedDirectly(import.meta.url)) {
  const [inline, linked, member, count = '7'] = process.argv.slice(2)
  const samples = Number(count)
  if (!inline || !linked || !member || !Number.isInteger(samples) || samples < 1 || samples > 25) {
    console.error('Usage: node scripts/site-theme-css-measurement.mjs INLINE_URL LINKED_URL MEMBER_URL [SAMPLES]')
    process.exitCode = 1
  } else {
    const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
    try {
      const memberStorageState = process.env.PW_STORAGE_STATE
      const result = await measureThemeCss(browser, { inline, linked, member, samples, memberStorageState })
      console.log(JSON.stringify(result, null, 2))
    } finally {
      await browser.close()
    }
  }
}
