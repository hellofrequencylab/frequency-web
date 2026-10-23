import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

import { assertNoServerErrors, assertNotProtectionWall } from './surfaces'

async function assertPublicTarget(page: Page, target: URL) {
  await assertNotProtectionWall(page)
  const finalUrl = new URL(page.url())
  expect(finalUrl.origin, 'Preview origin must survive navigation').toBe(target.origin)
  // next.config.ts explicitly redirects the currently hidden Stories route.
  const expectedPath = target.pathname === '/stories' ? '/the-community' : target.pathname
  expect(finalUrl.pathname.replace(/\/$/, '') || '/', 'Requested route or its explicit canonical alias must survive navigation').toBe(expectedPath.replace(/\/$/, '') || '/')
  await expect(page.locator('[data-kit="site"]')).toBeVisible()
}

/** Runs in the page; classifications remain in the artifact for editorial review. */
function inspectCopyGeometry(scopeSelector?: string) {
  const scopedRoot = scopeSelector ? document.querySelector(scopeSelector) : null
  if (scopeSelector && !scopedRoot) throw new Error(`Missing copy-fit scope: ${scopeSelector}`)
  const root = scopedRoot ?? document.querySelector('[data-kit="site"]') ?? document.querySelector('main') ?? document.body
  const screenReaderOnly = (el: Element) => {
    for (let parent: Element | null = el; parent; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      if (parent.classList.contains('sr-only') || parent.classList.contains('visually-hidden')) return true
      const r = parent.getBoundingClientRect()
      // The conventional offscreen accessible-label technique, not arbitrary small copy.
      if (['absolute', 'fixed'].includes(s.position) && r.width <= 1 && r.height <= 1 &&
        (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)')) return true
    }
    return false
  }
  const closedDisclosure = (el: Element) => {
    for (let parent: Element | null = el; parent; parent = parent.parentElement) {
      if (!(parent instanceof HTMLDetailsElement) || parent.open) continue
      const summary = [...parent.children].find(child => child.tagName === 'SUMMARY')
      if (!summary?.contains(el)) return parent
    }
    return null
  }
  const visible = (el: Element) => {
    if (closedDisclosure(el)) return false
    if (el.closest('[aria-hidden="true"], [inert]') || screenReaderOnly(el)) return false
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    for (let parent: Element | null = el; parent; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    return true
  }
  type Finding = { tag: string; text: string; reason: string }
  const clipped: Finding[] = []
  const fontBoxOnlyText: Finding[] = []
  const fontInkUnverified: Finding[] = []
  const canvas = document.createElement('canvas').getContext('2d')
  const confirmedInk = (el: Element, text: string, node: Node, rects: DOMRect[]) => {
    // Each line needs independently matching advance width and font height.
    // Complex/unmatched painting stays a strict finding for manual review.
    if (!canvas || rects.length === 0 || rects.length > 20 || (node.textContent?.length ?? 0) > 2000) return null
    const style = getComputedStyle(el)
    if (style.writingMode !== 'horizontal-tb' || style.textShadow !== 'none' ||
      style.textDecorationLine !== 'none' || parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0 ||
      !['none', 'uppercase', 'lowercase'].includes(style.textTransform) || !style.font) return null
    canvas.font = style.font
    canvas.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
    canvas.wordSpacing = style.wordSpacing === 'normal' ? '0px' : style.wordSpacing
    canvas.fontStretch = style.fontStretch as CanvasFontStretch
    canvas.fontVariantCaps = style.fontVariantCaps as CanvasFontVariantCaps
    canvas.direction = style.direction as CanvasDirection
    if (!document.fonts.check(canvas.font, text)) return null
    const inkRects: DOMRect[] = []
    const proofs: string[] = []
    for (const rect of rects) {
      let line = text
      if (rects.length > 1) {
        const raw = node.textContent ?? ''
        let offset = 0
        const characters: string[] = []
        for (const character of raw) {
          const piece = document.createRange()
          piece.setStart(node, offset)
          offset += character.length
          piece.setEnd(node, offset)
          if ([...piece.getClientRects()].some(box => box.width > 0 && Math.abs(box.top - rect.top) <= 0.25 && Math.abs(box.height - rect.height) <= 0.25)) characters.push(character)
        }
        line = characters.join('').replace(/\s+/g, ' ').trim()
      }
      if (!line) return null
      const painted = style.textTransform === 'uppercase' ? line.toUpperCase() : style.textTransform === 'lowercase' ? line.toLowerCase() : line
      let matched = false
    // Canvas auto-kerning and DOM auto-kerning can choose differently. Require
    // a measured match; an inferred font/baseline never earns an exemption.
    const kernings: CanvasFontKerning[] = style.fontKerning === 'auto' ? ['auto', 'normal', 'none'] : [style.fontKerning as CanvasFontKerning]
    for (const kerning of kernings) {
      canvas.fontKerning = kerning
      const metrics = canvas.measureText(painted)
      const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent,
        actualBoundingBoxAscent: inkAscent, actualBoundingBoxDescent: inkDescent } = metrics
      if (![ascent, descent, inkAscent, inkDescent, metrics.width].every(Number.isFinite) ||
        ascent <= 0 || descent < 0 || inkAscent <= 0 || inkDescent < 0 ||
        Math.abs(ascent + descent - rect.height) > 0.25 || Math.abs(metrics.width - rect.width) > 0.25) continue
      const top = rect.top + ascent - inkAscent
      const bottom = rect.top + ascent + inkDescent
      // Retain the original horizontal range bounds. This never excuses price/CTA width overflow.
      inkRects.push(new DOMRect(rect.left, top, rect.width, bottom - top))
      proofs.push(`range-height=${rect.height}; font-box=${ascent + descent}; width-delta=${Math.abs(metrics.width - rect.width).toFixed(4)}; ink-y=${top.toFixed(4)}→${bottom.toFixed(4)}`)
      matched = true
      break
    }
    if (!matched) return null
    }
    return { rects: inkRects, reason: `Matched font ${canvas.font}; ${proofs.join('; ')}` }
  }
  const intentionalTruncation: Finding[] = []
  const reachableScroll: Finding[] = []
  const repeatedTicker: Finding[] = []
  let accessibleOnlyTextNodes = 0
  let visibleTextNodes = 0
  let closedDisclosureTextNodes = 0
  const expectedClosedDisclosures: Finding[] = []
  const hiddenExpandedAnswers: Finding[] = []
  const recordedClosed = new Set<Element>()
  const outside = (rects: DOMRect[], box: DOMRect, x: boolean, y: boolean) => rects.some(t =>
    (x && (t.left < box.left - 2 || t.right > box.right + 2)) ||
    (y && (t.top < box.top - 2 || t.bottom > box.bottom + 2)))
  // Existing kit teaser/detail cards only. A clamp added to a hero or CTA stays a failure.
  const teaserSelector = '.dx-tx b, .dx-tx em, .fqm-it .tx b, .fqm-it .tx em, .locpill span, .dx-clamp, .dd-clamp, .dx-post p, .fn-card .fn-desc, .nk-scr .r span, .nk-ev b, .nk-ev small, .pc-dock-pitch span'
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const el = node.parentElement
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!el || !text || el.closest('script, style, svg, [role="tooltip"]')) continue
    if (screenReaderOnly(el)) { accessibleOnlyTextNodes++; continue }
    const closed = closedDisclosure(el)
    if (closed) {
      closedDisclosureTextNodes++
      if (!recordedClosed.has(closed)) {
        recordedClosed.add(closed)
        expectedClosedDisclosures.push({ tag: closed.tagName, text: closed.querySelector(':scope > summary')?.textContent?.trim().slice(0, 180) ?? '', reason: 'Native disclosure is intentionally closed; its answer is checked in the expanded state' })
      }
      continue
    }
    if (!visible(el)) {
      const open = el.closest('details[open]')
      const summary = open?.querySelector(':scope > summary')
      // A native answer must become painted when opened. Do not let a stale CSS
      // display:none/max-height:0 turn a unique expanded answer into a silent pass.
      if (open && !summary?.contains(el) && !el.closest('[aria-hidden="true"], [inert]')) {
        hiddenExpandedAnswers.push({ tag: el.tagName, text: text.slice(0, 180), reason: 'Expanded native answer text is not painted' })
      }
      continue
    }
    visibleTextNodes++
    const range = document.createRange()
    range.selectNodeContents(node)
    let rects = [...range.getClientRects()]
    const finding = (parent: Element, reason: string): Finding => ({
      tag: el.tagName, text: text.slice(0, 180), reason: `${reason}: ${parent.tagName}.${parent.className}`,
    })
    for (let parent: Element | null = el; parent && parent !== document.body; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      const box = parent.getBoundingClientRect()
      const scrollX = ['auto', 'scroll'].includes(s.overflowX) && parent.scrollWidth > parent.clientWidth
      const scrollY = ['auto', 'scroll'].includes(s.overflowY) && parent.scrollHeight > parent.clientHeight
      if ((scrollX || scrollY) && outside(rects, box, scrollX, scrollY)) {
        // Content outside an inner scrollport remains reachable. An inner malformed clip
        // would already have failed before reaching this ancestor.
        reachableScroll.push(finding(parent, 'Content reachable by scrolling'))
        break
      }
      const clipsX = ['hidden', 'clip'].includes(s.overflowX)
      const clipsY = ['hidden', 'clip'].includes(s.overflowY)
      if (!outside(rects, box, clipsX, clipsY)) continue
      if (clipsY) {
        const ink = confirmedInk(el, text, node, rects)
        if (ink && !outside(ink.rects, box, clipsX, clipsY)) {
          fontBoxOnlyText.push(finding(parent, `Font leading exceeds the box while confirmed painted ink fits. ${ink.reason}`))
          rects = ink.rects
          continue
        }
        fontInkUnverified.push(finding(parent, ink ? 'Confirmed painted ink exceeds clipping box' : 'Font ink could not be independently confirmed; strict clipping retained'))
      }
      const ticker = el.closest('.lv-track')
      const tickerLink = el.closest('a[href]')
      if (ticker && tickerLink && [...root.querySelectorAll('a[href]')].some(link =>
        !link.closest('.lv-track') && link.getAttribute('href') === tickerLink.getAttribute('href') && visible(link))) {
        repeatedTicker.push(finding(parent, 'Repeated ticker destination is available in the main list'))
        break
      }
      const clamp = Number.parseInt(s.webkitLineClamp, 10) > 0
      const ellipsis = s.textOverflow === 'ellipsis'
      const primaryCopy = !!el.closest('h1, h2, .ctas, button')
      if (parent.matches(teaserSelector) && (clamp || ellipsis) && !primaryCopy) {
        // Classify only this nearest intended teaser clip; continue checking outer ancestors.
        // A broken card or page clip cannot inherit the teaser's exemption.
        intentionalTruncation.push(finding(parent, 'Kit teaser truncation for manual review'))
        // Check only the painted fragment against outer boxes. The elided continuation is
        // retained in this report, but is not painted through a surrounding rounded card.
        rects = rects.map(t => {
          const left = clipsX ? Math.max(t.left, box.left) : t.left
          const top = clipsY ? Math.max(t.top, box.top) : t.top
          const right = clipsX ? Math.min(t.right, box.right) : t.right
          const bottom = clipsY ? Math.min(t.bottom, box.bottom) : t.bottom
          return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
        }).filter(t => t.width > 0 && t.height > 0)
        continue
      }
      clipped.push(finding(parent, 'Text exceeds clipping box'))
      break
    }
  }
  // Text ranges cannot detect a non-text callout wrapper or a rotated graphic box.
  // Keep a viewport geometry pass alongside text clipping, without allowing page clips.
  const repeatedTickerBoxes: Finding[] = []
  const repeatedTickerTrack = (track: Element) => {
    const links = [...track.querySelectorAll('a[href]')].filter(visible)
    if (links.length === 0 || links.some(link => ![...root.querySelectorAll('a[href]')].some(other =>
      !other.closest('.lv-track') && other.getAttribute('href') === link.getAttribute('href') && visible(other)))) return false
    // A unique control or meaningful text outside those links is not duplicated by a destination.
    if ([...track.querySelectorAll('button, input, select, textarea, [role="button"], [tabindex]')].some(el => visible(el) && !el.matches('a[href]'))) return false
    if ([...track.querySelectorAll('img, video, audio, canvas, [role="img"], [aria-label]')].some(el => {
      if (!visible(el)) return false
      const link = el.closest('a[href]')
      return !link || !links.includes(link)
    })) return false
    const textNodes = document.createTreeWalker(track, NodeFilter.SHOW_TEXT)
    while (textNodes.nextNode()) {
      const node = textNodes.currentNode
      const el = node.parentElement
      if (!el || !node.textContent?.trim() || el.closest('script, style, svg') || !visible(el)) continue
      const link = el.closest('a[href]')
      if (!link || !track.contains(link) || !links.includes(link)) return false
    }
    return true
  }
  function inertBox(el: Element){
   if(el.textContent?.trim())return false;
   const meaningful='a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"],[role],[aria-label],[aria-labelledby],[aria-describedby],[title],[alt],img,svg,video,audio,canvas,object,embed,iframe';
   if(el.matches(meaningful)||el.querySelector(meaningful))return false;
   for(const node of [el,...el.querySelectorAll('*')])for(const pseudo of ['::before','::after']){const content=getComputedStyle(node,pseudo).content;if(content&&!['none','normal','""',"''"].includes(content))return false;}
   return true;
  }
  const decorativeBoxes: Finding[] = []
  const boxesOutsideViewport: Finding[] = []
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!visible(el) || el.closest('script, style, [role="tooltip"]')) continue
    const box = el.getBoundingClientRect()
    if (box.left >= -2 && box.right <= innerWidth + 2) continue
    let reachable = false
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      if (['auto', 'scroll'].includes(s.overflowX) && parent.scrollWidth > parent.clientWidth) {
        reachable = true
        break
      }
    }
    if (reachable) continue
    const track = el.closest('.lv-track')
    if (track && repeatedTickerTrack(track)) {
      repeatedTickerBoxes.push({ tag: el.tagName, text: el.textContent?.trim().slice(0, 180) ?? '',
        reason: 'Whole ticker contains only destinations also available in the main list' })
      continue
    }
    if (inertBox(el)) {
      decorativeBoxes.push({ tag: el.tagName, text: '', reason: 'Semantically inert empty subtree extends beyond viewport; no text/control/label/media/pseudo content' })
      continue
    }
    boxesOutsideViewport.push({ tag: el.tagName, text: el.textContent?.trim().slice(0, 180) ?? '',
      reason: `Box outside viewport: ${el.className} (${Math.round(box.left)}→${Math.round(box.right)})` })
  }
  const hero = document.querySelector('main .hero, main .phero, #nk-hero, [data-screen-label="01 Hero"]')
  const primary = hero?.querySelector('.ctas a, .ctas button, a.btn, button[type="submit"]')
  return {
    url: location.href, width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    clipped, fontBoxOnlyText, fontInkUnverified, intentionalTruncation, reachableScroll, repeatedTicker, accessibleOnlyTextNodes, boxesOutsideViewport, repeatedTickerBoxes, decorativeBoxes,
    visibleTextNodes, closedDisclosureTextNodes, expectedClosedDisclosures, hiddenExpandedAnswers,
    primary: primary ? {
      text: primary.textContent?.trim(), visible: visible(primary),
      horizontallyReachable: primary.getBoundingClientRect().left >= -2 && primary.getBoundingClientRect().right <= innerWidth + 2,
      bounds: primary.getBoundingClientRect().toJSON(),
    } : null,
    h1: document.querySelector('h1')?.textContent?.trim(),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(x => x.textContent),
  }
}

/** Only reviewed read-only controls inside main: native disclosures and the kit's
 * tool tabs/notes. No generic buttons, links, inputs, sign-up or form actions. */
function collectReadOnlyCopyDisclosures() {
  const main = document.querySelector('main')
  if (!main) return []
  const entries: { id: string; kind: 'native' | 'tool-tab' | 'tool-note'; label: string; initiallyExpanded: boolean; panelId?: string; exclusiveGroup?: string }[] = []
  const add = (el: Element, entry: Omit<(typeof entries)[number], 'id'>) => {
    const id = `copy-disclosure-${entries.length}`
    el.setAttribute('data-copy-fit-disclosure', id)
    entries.push({ id, ...entry })
  }
  for (const details of main.querySelectorAll('details')) {
    const summary = details.querySelector(':scope > summary')
    if (!summary || details.closest('form, nav, header, footer') || details.matches('.hc-mob') ||
      details.querySelector('form') || summary.querySelector('a, button, input, select, textarea')) continue
    add(details, { kind: 'native', label: summary.textContent?.trim() ?? '', initiallyExpanded: details.open, exclusiveGroup: details.getAttribute('name') ?? undefined })
  }
  for (const tab of main.querySelectorAll('.nk-ex .nk-tl button[role="tab"][aria-controls]')) {
    if (tab.closest('form') || tab.getAttribute('type') !== 'button') continue
    const panelId = tab.getAttribute('aria-controls')!
    if (!document.getElementById(panelId)) continue
    add(tab, { kind: 'tool-tab', label: tab.textContent?.trim() ?? '', initiallyExpanded: tab.getAttribute('aria-selected') === 'true', panelId })
  }
  for (const note of main.querySelectorAll('.nk-mess button.nk-planet[type="button"]')) {
    if (note.closest('form')) continue
    add(note, { kind: 'tool-note', label: note.textContent?.trim() ?? '', initiallyExpanded: note.getAttribute('aria-expanded') === 'true' })
  }
  return entries
}

async function reviewReadOnlyCopyDisclosures(page: Page) {
  const inventory = await page.evaluate(collectReadOnlyCopyDisclosures)
  const states: { id: string; kind: string; label: string; report: ReturnType<typeof inspectCopyGeometry> }[] = []
  const settle = async (selector: string) => {
    await page.locator(selector).evaluate(async el => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const finite = el.getAnimations({ subtree: true }).filter(a => {
        const timing = a.effect?.getComputedTiming()
        return timing && Number.isFinite(timing.endTime) && timing.endTime <= 4000
      })
      await Promise.all(finite.map(a => a.finished.catch(() => undefined)))
    })
  }
  const expectedInactiveControls: { id: string; label: string; reason: string }[] = []
  for (const entry of inventory) {
    const selector = `[data-copy-fit-disclosure="${entry.id}"]`
    const control = page.locator(selector)
    if (!await control.isVisible()) {
      expectedInactiveControls.push({ id: entry.id, label: entry.label, reason: 'Control is not painted in the current responsive state' })
      continue
    }
    let scope = selector
    if (entry.kind === 'native') {
      if (!await control.evaluate(el => (el as HTMLDetailsElement).open)) await control.locator(':scope > summary').press('Space')
      await expect(control).toHaveJSProperty('open', true)
    } else if (entry.kind === 'tool-tab') {
      await control.press('Space')
      await expect(control).toHaveAttribute('aria-selected', 'true')
      scope = `[id="${entry.panelId}"]`
      await expect(page.locator(scope)).toBeVisible()
    } else {
      if (await control.getAttribute('aria-expanded') !== 'true') await control.press('Space')
      await expect(control).toHaveAttribute('aria-expanded', 'true')
      scope = '.nk-gpop:not([hidden])'
      await expect(page.locator(scope)).toBeVisible()
    }
    await settle(scope)
    const report = await page.evaluate(inspectCopyGeometry, scope)
    states.push({ id: entry.id, kind: entry.kind, label: entry.label, report })
    if (entry.kind === 'tool-note') {
      await page.locator(`${scope} button.x[aria-label="Close"]`).press('Space')
      await expect(page.locator(scope)).toHaveCount(0)
    }
  }
  return { inventory, states, expectedInactiveControls }
}

async function settlePublicCopyGeometry(page: Page) {
  let previous = ''
  let stable = 0
  for (let sample = 0; sample < 80; sample++) {
    const signature = await page.evaluate(() => {
      const selectors = 'h1, .hero .ctas a, .hero .ctas button, .phero .ctas a, #nk-hero .ctas a, [data-screen-label="01 Hero"] .ctas a, .pc-panel:not([aria-hidden="true"])'
      return JSON.stringify([...document.querySelectorAll(selectors)].flatMap(el => {
        const box = el.getBoundingClientRect()
        if (box.width <= 0 || box.height <= 0) return []
        let opacity = 1
        for (let parent: Element | null = el; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          if (style.display === 'none' || style.visibility === 'hidden') return []
          opacity *= Number(style.opacity)
        }
        return [{ tag: el.tagName, text: el.textContent?.trim(), opacity: Math.round(opacity * 10000),
          rect: [box.left, box.top, box.width, box.height].map(value => Math.round(value * 10)) }]
      }))
    })
    if (signature === previous) stable++
    else stable = 0
    if (stable >= 4) return
    previous = signature
    await page.waitForTimeout(100)
  }
  throw new Error('Visible hero/control/pricing copy geometry did not settle within 8 seconds')
}

async function settleViewportReveals(page: Page) {
  // site-fx.tsx staggers .pop.in by170ms. Wait for the same20% intersection
  // threshold/root margin before advancing, rather than outrunning its queue.
  await page.waitForFunction(() => [...document.querySelectorAll('.pop:not(.in)')].every(el => {
    const box = el.getBoundingClientRect()
    const area = box.width * box.height
    if (area <= 0) return true
    const intersect = Math.max(0, Math.min(box.right, innerWidth) - Math.max(box.left, 0)) *
      Math.max(0, Math.min(box.bottom, innerHeight * 0.94) - Math.max(box.top, 0))
    return intersect / area < 0.2
  }), undefined, { timeout: 6000 })
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => {
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null
      if (!(target instanceof Element) || !target.closest('.pop.in')) return false
      const box = target.getBoundingClientRect()
      if (box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) return false
      const timing = animation.effect?.getComputedTiming()
      return timing && Number.isFinite(timing.endTime) && timing.endTime <= 4000
    })
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)))
  })
}

async function revealPublicCopy(page: Page) {
  let nextTop = 0
  let completed = false
  let stableBottom = 0
  // Bound an unexpectedly unending/lazy-loaded page with an explicit failure.
  for (let step = 0; step < 600; step++) {
    const position = await page.evaluate(async top => {
      window.scrollTo({ top, behavior: 'instant' })
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      return { top: window.scrollY, height: innerHeight, bottom: window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2 }
    }, nextTop)
    await settleViewportReveals(page)
    if (position.bottom) {
      if (++stableBottom === 3) { completed = true; break }
      // Give lazy content a chance to grow before confirming the document end.
      await page.waitForTimeout(100)
    } else stableBottom = 0
    nextTop = position.top + Math.max(120, Math.floor(position.height * 0.75))
  }
  expect(completed, 'Public page traversal reached a stable document end').toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
}

// Standalone, read-only public copy review. Run against an existing preview.
const base = process.env.PW_BASE_URL
function parseCopyFitRoutes(input?: string) {
  const full = '/,/the-community,/spaces,/features,/pricing,/networks,/vision,/stories,/for,/for/coaches-and-healers,/for/studios,/for/event-hosts,/for/venues,/for/nonprofits,/for/networks,/discover,/discover/events,/discover/circles,/discover/spaces,/discover/topics,/discover/practices,/discover/journeys,/about,/friendship-as-an-adult,/how-to-start-a-circle,/how-to-build-community,/how-to-be-more-social,/loneliness,/mindless,/vs/partiful,/vs/eventbrite,/vs/mighty-networks,/vs/meetup,/vs/facebook-groups'.split(',')
  if (!input?.trim()) return full
  const selected = input.split(',').map(route => route.trim())
  // Validate before constructing URLs or navigating with any preview credentials.
  // Exact known paths exclude origins, protocols, query/fragment and encoded bypasses.
  for (const route of selected) {
    if (!full.includes(route)) throw new Error(`Unsupported COPY_FIT_ROUTES path: ${route}`)
  }
  return [...new Set(selected)]
}
const routes = parseCopyFitRoutes(process.env.COPY_FIT_ROUTES)
for (const width of [320, 390, 1280]) {
  for (const route of routes) {
    test(`@visual @copyfit ${width}px ${route}`, async ({ page, serverErrors }, info) => {
      test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit copy-fit run uses its own three viewport widths')
      test.skip(!base, 'PW_BASE_URL must point to an existing deployment')
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
      const target = new URL(route, base)
      const response = await page.goto(target.href, { waitUntil: 'domcontentloaded' })
      expect(response?.status(), 'Public route response').toBeLessThan(400)
      await assertPublicTarget(page, target)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('h1').first()).toBeVisible()
      expect(await page.title(), 'Document title').not.toMatch(/Authentication Required|Vercel Login/i)
      // Traverse document positions rather than retaining headings across hydration.
      await revealPublicCopy(page)
      await settlePublicCopyGeometry(page)
      const report = await page.evaluate(inspectCopyGeometry)
      await info.attach('copy-fit-report', { body: JSON.stringify({ requestedUrl: target.href, finalUrl: page.url(), ...report }, null, 2), contentType: 'application/json' })
      await info.attach('full-page', { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' })
      const disclosures = await reviewReadOnlyCopyDisclosures(page)
      await info.attach('expanded-disclosure-report', { body: JSON.stringify(disclosures, null, 2), contentType: 'application/json' })
      await page.evaluate(() => window.scrollTo(0, 0))
      const expanded = await page.evaluate(inspectCopyGeometry)
      await info.attach('expanded-copy-fit-report', { body: JSON.stringify(expanded, null, 2), contentType: 'application/json' })
      await info.attach('expanded-full-page', { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' })
      await assertPublicTarget(page, target)
      assertNoServerErrors(serverErrors, `${width}px ${route}`)
      expect(disclosures.states.length + disclosures.expectedInactiveControls.length, 'Every safe disclosure has a measured or explicit responsive state').toBe(disclosures.inventory.length)
      for (const state of disclosures.states) {
        expect(state.report.clipped, `${state.label}: expanded answer text fits`).toEqual([])
        expect(state.report.hiddenExpandedAnswers, `${state.label}: expanded answer text is painted`).toEqual([])
        expect(state.report.visibleTextNodes, `${state.label}: actual text was measured`).toBeGreaterThan(0)
        expect(state.report.boxesOutsideViewport, `${state.label}: expanded answer boxes fit`).toEqual([])
      }
      expect(expanded.overflow, 'Expanded document fits').toBe(false)
      expect(expanded.clipped, 'Expanded page copy fits').toEqual([])
      expect(expanded.hiddenExpandedAnswers, 'Expanded answers are painted').toEqual([])
      expect(expanded.boxesOutsideViewport, 'Expanded page boxes fit').toEqual([])
      expect(report.overflow, 'Horizontal document overflow').toBe(false)
      expect(report.clipped, 'Visible text clipped by an ancestor').toEqual([])
      expect(report.hiddenExpandedAnswers, 'Initially open answers are painted').toEqual([])
      expect(report.boxesOutsideViewport, 'Visible layout boxes fit the viewport').toEqual([])
      if (report.primary) {
        expect(report.primary.visible, 'Primary hero action is visible').toBe(true)
        expect(report.primary.horizontallyReachable, 'Primary hero action fits the viewport').toBe(true)
      }
    })
  }
}

// Local fixtures verify that a hidden tooltip cannot hide its off-screen callout wrapper,
// that real inner scrollers remain reachable, and that an auth page is never a public-page pass.
test('copy-fit detector rejects clipped callouts and wrong destinations @visual @copyfit', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One deterministic fixture project is sufficient')
  await page.setViewportSize({ width: 320, height: 568 })
  const fixture = (body: string) => `<style>*{box-sizing:border-box}html,body{margin:0;width:320px}body{overflow-x:clip}</style><main data-kit="site" style="width:320px;overflow:clip">${body}</main>`
  await page.setContent(fixture('<div class="pm-float" style="margin-left:174px;width:152px;height:152px"><span style="display:block;width:152px;height:152px;border-radius:50%;background:blue"></span><span role="tooltip" style="display:none">Run every chapter as one organization</span></div>'))
  let report = await page.evaluate(inspectCopyGeometry)
  expect(report.clipped).toEqual([]) // No visible text range: the separate box gate must catch this.
  expect(report.boxesOutsideViewport.some(x => x.reason.includes('pm-float'))).toBe(true)
  await page.setContent(fixture('<div style="width:200px;overflow-x:auto"><div style="width:400px;height:40px">A reachable scrolling row with useful content.</div></div>'))
  report = await page.evaluate(inspectCopyGeometry)
  expect(report.boxesOutsideViewport).toEqual([])
  expect(report.clipped).toEqual([])
  await page.setContent(fixture('<div style="display:none;margin-left:300px;width:200px">Hidden content.</div>'))
  expect((await page.evaluate(inspectCopyGeometry)).boxesOutsideViewport).toEqual([])
  const ticker = (extra: string) => fixture(`<a href="/events/example">Example event in the main list</a><div class="lv-track" style="width:640px"><a href="/events/example">Example event</a>${extra}</div>`)
  await page.setContent(ticker(''))
  report = await page.evaluate(inspectCopyGeometry)
  expect(report.boxesOutsideViewport).toEqual([])
  expect(report.repeatedTickerBoxes.length).toBeGreaterThan(0)
  await page.setContent(ticker('<a href="/unique" style="margin-left:350px">Unique offscreen CTA</a>'))
  report = await page.evaluate(inspectCopyGeometry)
  expect(report.boxesOutsideViewport.length).toBeGreaterThan(0)
  expect(report.repeatedTickerBoxes).toEqual([])
  await page.setContent(ticker('<strong>Unique information outside an event link</strong>'))
  expect((await page.evaluate(inspectCopyGeometry)).boxesOutsideViewport.length).toBeGreaterThan(0)
  await page.setContent(ticker('<img alt="Unique illustrated offer" style="width:50px;height:50px">'))
  expect((await page.evaluate(inspectCopyGeometry)).boxesOutsideViewport.length).toBeGreaterThan(0)
  const authWall = { url: () => 'https://vercel.com/login', title: async () => 'Login – Vercel' } as unknown as Page
  await expect(assertPublicTarget(authWall, new URL('https://example.test/pricing'))).rejects.toThrow('Deployment Protection')
  const wrongRoute = { url: () => 'https://example.test/other', title: async () => 'Real page' } as unknown as Page
  await expect(assertPublicTarget(wrongRoute, new URL('https://example.test/pricing'))).rejects.toThrow()
  await page.setContent('<h1>Login – Vercel</h1>')
  await expect(assertPublicTarget(page, new URL(page.url()))).rejects.toThrow()
  await page.setContent(fixture('<h1>Plans and pricing</h1>'))
  await assertPublicTarget(page, new URL(page.url()))
  await assertPublicTarget({ url: () => 'https://example.test/the-community', title: async () => 'The community', locator: selector => page.locator(selector) } as unknown as Page, new URL('https://example.test/stories'))
  expect(parseCopyFitRoutes('')).toHaveLength(34)
  expect(parseCopyFitRoutes('  ')).toHaveLength(34)
  expect(parseCopyFitRoutes('/,/pricing')).toEqual(['/', '/pricing'])
  for (const unsafe of ['https://evil.example/', '//evil.example/', '/pricing?next=bad', '/pricing#bad', '/%2f%2fevil.example', '/unknown', '/,']) {
    expect(() => parseCopyFitRoutes(unsafe)).toThrow('Unsupported COPY_FIT_ROUTES path')
  }

})

// Disclosure controls are local, deterministic and opt-in. A closed answer may be
// intentionally unpainted; the same unique text must still fail if clipped after opening.
test('copy-fit checks expanded unique answers and preserves safe control scope @visual @copyfit', async ({ page }, info) => {
  test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit local disclosure control')
  await page.setViewportSize({ width: 320, height: 568 })
  const fixture = (body: string) => `<style>html,body{margin:0;width:320px}*{box-sizing:border-box}main{width:320px}details{width:280px}summary{cursor:pointer}</style><main data-kit="site">${body}</main>`
  await page.setContent(fixture('<div class="qa"><details><summary>A useful question</summary><div style="max-height:18px;overflow:hidden"><p>Unique answer copy must remain readable in full. This answer deliberately continues across several lines in a narrow card.</p></div></details></div>'))
  const initial = await page.evaluate(inspectCopyGeometry)
  expect(initial.clipped).toEqual([])
  expect(initial.expectedClosedDisclosures).toHaveLength(1)
  expect(initial.closedDisclosureTextNodes).toBeGreaterThan(0)
  const expanded = await reviewReadOnlyCopyDisclosures(page)
  expect(expanded.states).toHaveLength(1)
  expect(expanded.states[0].report.clipped.some(x => x.text.startsWith('Unique answer copy'))).toBe(true)
  await page.setContent(fixture('<div class="qa"><details open><summary>Another question</summary><div style="display:none">Unique answer hidden despite being expanded.</div></details></div>'))
  expect((await page.evaluate(inspectCopyGeometry)).hiddenExpandedAnswers.some(x => x.text.startsWith('Unique answer hidden'))).toBe(true)
  await page.setContent(fixture('<div class="qa"><details name="one"><summary>First question</summary><p>First complete answer is readable.</p></details><details name="one"><summary>Second question</summary><p>Second complete answer is readable.</p></details></div><form><details><summary>Form controls are excluded</summary><input name="email"/><button>Join</button></details></form><button type="button" aria-expanded="false">Unrelated action is excluded</button>'))
  const grouped = await reviewReadOnlyCopyDisclosures(page)
  expect(grouped.inventory).toHaveLength(2)
  expect(grouped.states).toHaveLength(2)
  expect(grouped.states.every(x => x.report.clipped.length === 0 && x.report.hiddenExpandedAnswers.length === 0)).toBe(true)
  expect(grouped.inventory.every(x => x.exclusiveGroup === 'one')).toBe(true)
  expect(await page.locator('form details').evaluate(el => (el as HTMLDetailsElement).open)).toBe(false)
  await page.setContent(fixture('<div class="nk-ex"><div class="nk-tl"><button type="button" role="tab" aria-selected="true" aria-controls="nk-panel-0" onclick="this.setAttribute(\'aria-selected\',\'true\');document.getElementById(\'nk-panel-0\').hidden=false;document.getElementById(\'nk-panel-1\').hidden=true">First tool</button><button type="button" role="tab" aria-selected="false" aria-controls="nk-panel-1" onclick="this.setAttribute(\'aria-selected\',\'true\');document.getElementById(\'nk-panel-1\').hidden=false;document.getElementById(\'nk-panel-0\').hidden=true">Second tool</button></div><div id="nk-panel-0" role="tabpanel">First complete tool note.</div><div id="nk-panel-1" role="tabpanel" hidden>Second complete tool note.</div></div>'))
  const tabs = await reviewReadOnlyCopyDisclosures(page)
  expect(tabs.states).toHaveLength(2)
  expect(tabs.states.every(state => state.report.visibleTextNodes > 0 && state.report.clipped.length === 0)).toBe(true)
  await page.setContent(fixture(`<div class="nk-mess"><button type="button" class="nk-planet" aria-haspopup="dialog" aria-expanded="true" onclick="this.setAttribute('aria-expanded','true');document.getElementById('note').hidden=false">A tool note</button><div id="note" class="nk-gpop" role="dialog"><p>A complete inline note is readable.</p><button type="button" class="x" aria-label="Close" onclick="document.getElementById('note').hidden=true;document.querySelector('.nk-planet').setAttribute('aria-expanded','false')">Close</button></div></div>`))
  const notes = await reviewReadOnlyCopyDisclosures(page)
  expect(notes.states).toHaveLength(1)
  expect(notes.states[0].report.clipped).toEqual([])
  expect(notes.states[0].report.visibleTextNodes).toBeGreaterThan(0)
  expect(await page.locator('.nk-gpop').getAttribute('hidden')).not.toBeNull()
})

// A hydration-style heading replacement must not detach an indexed locator.
test('copy-fit traverses changing headings and reaches the document end @visual @copyfit', async ({ page }, info) => {
  test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit local traversal control')
  await page.setViewportSize({ width: 320, height: 568 })
  await page.setContent(`<main data-kit="site" style="height:2100px"><h1>Public page</h1><h2>Changing heading</h2></main><script>
    window.addEventListener('scroll', () => {
      const heading = document.querySelector('h2'); if (heading) heading.outerHTML = '<h2>Replaced heading</h2>';
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) document.body.dataset.bottomSeen = 'true';
    });
  </script>`)
  await revealPublicCopy(page)
  expect(await page.locator('body').getAttribute('data-bottom-seen')).toBe('true')
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('copy-fit waits for actual active copy geometry to settle @visual @copyfit', async ({ page }, info) => {
  test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit local geometry control')
  await page.setContent(`<main data-kit="site"><h1>Plans</h1><div class="pc-panel" style="transform:translateX(25px)">Active plan copy</div></main><script>
    let x = 25; const timer = setInterval(() => { x -= 5; document.querySelector('.pc-panel').style.transform = 'translateX(' + x + 'px)'; if (x === 0) clearInterval(timer); }, 100);
  </script>`)
  await settlePublicCopyGeometry(page)
  expect(await page.locator('.pc-panel').evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)')
})

test('copy-fit retains genuinely clipped descender ink @visual @copyfit', async ({ page }, info) => {
  test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit local font-ink control')
  await page.setContent('<main data-kit="site"><div style="font:40px/48px Arial;overflow:hidden;height:31px;width:220px">gyp</div></main>')
  const report = await page.evaluate(inspectCopyGeometry)
  expect(report.clipped.some(finding => finding.text === 'gyp')).toBe(true)
  expect(report.fontBoxOnlyText).toEqual([])
  await page.setContent('<main data-kit="site"><div style="width:4px;height:40px;overflow:hidden;font:20px/30px Arial">Go</div><div style="width:4px;height:40px;overflow:hidden;font:20px/30px Arial">$9</div></main>')
  const short = await page.evaluate(inspectCopyGeometry)
  expect(short.clipped.some(finding => finding.text === 'Go')).toBe(true)
  expect(short.clipped.some(finding => finding.text === '$9')).toBe(true)
})

test('copy-fit waits for canonical staggered viewport reveals @visual @copyfit', async ({ page }, info) => {
  test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit local reveal control')
  await page.setContent('<style>.pop{opacity:0;transition:opacity .3s}.pop.in{opacity:1}</style><main data-kit="site"><h1>Public page</h1><p class="pop">A delayed paragraph remains part of the review.</p></main><script>setTimeout(()=>document.querySelector(".pop").classList.add("in"),500)</script>')
  await settleViewportReveals(page)
  expect(await page.locator('.pop').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
})

test('copy-fit distinguishes inert decoration from meaningful boxes @visual @copyfit', async ({ page }, info) => {
  test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit local semantic box controls')
  await page.setViewportSize({ width: 320, height: 568 })
  const cases: [string, string, boolean][] = [
    ['empty aura', '<div class="fq-aura"></div>', true],
    ['empty arbitrary decoration', '<div><span></span></div>', true],
    ['plain text', '<div>Plan details</div>', false],
    ['focusable graphic', '<div class="pm-float"><div tabindex="0" role="group" aria-label="Plan graphic"><span role="tooltip" hidden>Unique help</span></div></div>', false],
    ['accessible graphic', '<div aria-label="Plan graphic"></div>', false],
    ['media', '<div><svg></svg></div>', false],
    ['destination', '<div><a href="/join"></a></div>', false],
    ['signature', '<div class="h-sig" role="text" aria-label="Gather like it matters."><span aria-hidden="true">Gather like it matters.</span></div>', false],
    ['pseudo text', '<style>.unique::before{content:"Unique offer"}</style><div class="unique"></div>', false],
    ['hidden tooltip', '<div><span hidden>Unique help</span></div>', false],
  ]
  for (const [name, html, inert] of cases) {
    await page.setContent(`<style>html,body{margin:0;width:320px} main>div{margin-left:300px;width:100px;height:20px}</style><main data-kit="site">${html}</main>`)
    const report = await page.evaluate(inspectCopyGeometry)
    expect(report.boxesOutsideViewport.length === 0, name).toBe(inert)
    if (inert) expect(report.decorativeBoxes.length, name).toBeGreaterThan(0)
  }
})
