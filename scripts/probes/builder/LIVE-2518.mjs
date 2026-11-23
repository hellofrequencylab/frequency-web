// LIVE-2518 (child of LIVE-EDITOR-SHELL): the website editor holds on a phone, and its small print reads by day.
// Nothing here looks for a rule by name. A small copy of the toolbar's markup is laid under the three sheets the
// route loads (the generated kit, the hand-kept sheet beside it, the editor sheet) and the cascade is resolved
// the way a browser does it: media queries for the viewport, layer, specificity, then order. From the result:
//   1. THE PHONE GRID. At 320, 360 and 390 wide, with the inspector open, shut, and the left rail open, the
//      grid's fixed columns come to nothing (the rails are overlays), so the toolbar is the viewport's width and
//      the canvas keeps the middle column whichever rail has left the grid.
//   2. PUBLISH FITS. What the toolbar row cannot shrink (icon buttons, gaps, gutters, the save dot, Publish at an
//      upper bound for its label) fits the viewport, before and after a publish. After a publish the bar also
//      carries "View live site": it must still be shown, and the bar must have a row tall enough to hold it.
//   3. THE OPEN RAIL ON A PHONE shows its panel, not only its five icons, and at night an open overlay is a solid
//      surface: the canvas stays under it, and a light Site showing through glass would lift the ground.
//   4. SMALL PRINT, by day and at night, at 4.5:1 or better: a placeholder on each field ground the chrome
//      draws, the detail and count of the Header and Footer rows and of the chosen row (rest and hover), the
//      change count on Publish on every stop of the pastel, and the count of the field being edited on its
//      lit ground.
//   5. The inks those pairs read are shared --fq- tokens, with no literal colour.
// Run: node scripts/probes/builder/LIVE-2518.mjs
import fs from 'node:fs'
import { JSDOM } from 'jsdom'

const bad = []
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (f) => fs.readFileSync(f, 'utf8')
const core = strip(read('app/themes/frequency/core.css'))
const lifts = strip(read('app/themes/frequency.css'))
const shellTsx = read('components/sites/editor/shell.tsx')
const inspectorTsx = read('components/sites/editor/inspector.tsx')

// ── The markup, as components/sites/editor/shell.tsx draws the Frequency toolbar. Each piece the model leans on
//    is checked against the source, so the copy cannot drift from the real bar without this probe saying so. ──
for (const [what, re] of [
  ['the toolbar header', /<header className="top">/],
  ['Undo and Redo as phone-hidden icons', /<Icon label="Undo" className="pe-wide"/],
  ['Share as a phone-hidden button', /className="btn sm pe-wide" onClick=\{\(\) => void share\(\)\}/],
  ['the live link beside Publish', /\{publishedLive && <a className="btn sm" data-live-link /],
  ['Publish with its change count', /className="btn pa"[^\n]*<span className="pub-badge" aria-hidden>/],
  ['the save status button', /<button type="button" className=\{`save\$\{/],
  ['the page picker', /<div className="pick" ref=\{pickRef\}>/],
  ['the device group', /<div className="seg dev" role="group"/],
  ['the fold attributes on the grid', /<div className="pe" data-lf=\{left \? '0' : '1'\} data-rf=\{right \? '0' : '1'\} data-preview=/],
  ['the canvas as main.stage', /<main className="stage" data-device=/],
]) if (!re.test(shellTsx)) bad.push(`the probe's copy of the toolbar is out of date: shell.tsx no longer draws ${what}`)
const lit = /\{lit && <style>\{`([^`]*)`\}<\/style>\}/.exec(inspectorTsx)?.[1]?.replace('${CSS.escape(lit)}', 'title')
if (!lit) bad.push('inspector.tsx no longer writes the lit field rule this probe measures')

const html = (o) => `<!doctype html><html data-design="frequency" class="${o.dark ? 'dark' : ''}"><body>
<div data-editor-root data-kit="editor" data-website-theme="DAWN"><div class="pe" data-lf="${o.lf}" data-rf="${o.rf}" data-preview="0">
<header class="top">
  <a class="ib" id="back"></a><div class="brand"><span class="av"></span><span><b>Name</b><small>host</small></span></div>
  <div class="pick" id="pick"><button type="button"><span>Home</span></button><div class="menu"></div></div>
  <button type="button" class="save" id="save"><i></i><span>Draft saved</span></button><span class="sp"></span>
  <button type="button" class="ib" id="fold-left"></button><div class="seg dev"><button></button></div><button type="button" class="ib" id="fold-right"></button>
  <button type="button" class="ib pe-wide"></button><button type="button" class="ib pe-wide"></button><button type="button" class="ib" id="preview"></button>
  <span class="faces"><span>OP</span></span><button type="button" class="btn sm pe-wide">Share</button>
  ${o.live ? '<a class="btn sm" data-live-link id="live">View live site</a>' : ''}
  <button type="button" class="btn pa" id="publish">Publish<span class="pub-badge" id="badge">4</span></button>
</header>
<aside class="rail" id="rail"><div class="tabs"><button><span>Layers</span></button></div><div class="body" id="rail-body">
  <button type="button" class="row on" id="on-row"><span class="ic"></span><span class="t">Cards<small id="on-small">What is on this month</small></span><span class="meta" id="on-meta">2</span></button>
  <button type="button" class="row chrome" id="chrome-row"><span class="ic"></span><span class="t">Header<small id="chrome-small">Logo, menu, button</small></span><span class="meta" id="chrome-meta">Site</span></button>
  <label class="search" id="search"><input class="input" id="search-input" placeholder="Search blocks"></label>
  <div class="fld"><input class="input in" id="rail-in" placeholder="Home"></div>
</div><div class="foot"><span class="lbl">Changes save as a draft</span></div></aside>
<main class="stage" id="stage" data-device="phone"><section class="vera"><form class="bar" id="vera-bar"><input class="input" id="vera-input" placeholder="Ask Vera"></form></section></main>
<aside class="insp" id="insp"><div class="fields"><div class="we-inspector" data-lit="title"><div><div data-field="title" id="lit-field"><div><label>Title<em id="lit-count">21</em><span id="lit-hint">Hint</span></label><input class="input"></div></div></div></div>
  <div class="fld"><input class="input in" id="insp-in" placeholder="my-section"></div></div></aside>
</div></div></body></html>`

// ── The sheets: the app's own theme sheet (it carries shared day and night rules the chrome also wears), then the
//    route's, in shell.tsx import order: editor.css, the kit, the hand-kept sheet. ──
function scan(src) {
  const out = []
  const stack = []
  let buf = ''
  for (const ch of src) {
    if (ch === '{') { const pre = buf.trim(); buf = ''; stack.push(pre.startsWith('@') ? pre : { sel: pre }) }
    else if (ch === '}') { const top = stack.pop(); if (top && typeof top === 'object') out.push({ sel: top.sel, body: buf, at: stack.filter((s) => typeof s === 'string') }); buf = '' }
    else buf += ch
  }
  return out
}
function split(value, sep = ',') {
  const out = []
  let depth = 0, at = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === sep && !depth) { out.push(value.slice(at, i)); at = i + 1 }
  }
  out.push(value.slice(at))
  return out.map((s) => s.trim())
}
/** Specificity as one number: ids, then classes / attributes / pseudo-classes, then types. */
function specificity(sel) {
  let a = 0, b = 0, c = 0
  let s = sel.replace(/::[a-z-]+/g, () => { c++; return '' })
  for (;;) { // :is(), :not() and :has() count as their most specific argument
    const m = /:(is|not|has|where)\(/.exec(s)
    if (!m) break
    let depth = 1, i = m.index + m[0].length
    for (; i < s.length && depth; i++) { if (s[i] === '(') depth++; else if (s[i] === ')') depth-- }
    const inner = s.slice(m.index + m[0].length, i - 1)
    if (m[1] !== 'where') { const top = Math.max(...split(inner).map(specificity)); a += Math.floor(top / 10000); b += Math.floor(top / 100) % 100; c += top % 100 }
    s = s.slice(0, m.index) + s.slice(i)
  }
  a += (s.match(/#[\w-]+/g) ?? []).length
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return '' })
  b += (s.match(/\.[\w-]+/g) ?? []).length + (s.match(/:[a-z-]+/g) ?? []).length
  c += (s.replace(/[.:#][\w-]+/g, '').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return a * 10000 + b * 100 + c
}
const DRAWN = new Set([...html({ lf: '1', rf: '0', live: true }).matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))
const RULES = []
let order = 0
const sources = [['app', lifts], ['editor', strip(read('components/sites/editor/editor.css'))], ['kit', strip(read('app/themes/frequency/kit-editor.css'))], ['shell', strip(read('app/themes/frequency/editor-shell.css'))]]
if (lit) sources.push(['inspector', lit])
for (const [sheet, src] of sources) for (const r of scan(src)) {
  if (r.at.some((a) => /^@(keyframes|container|font-face|supports|property)/.test(a))) continue
  const decls = new Map()
  for (const d of split(r.body, ';')) { const at = d.indexOf(':'); if (at > 0) decls.set(d.slice(0, at).trim(), d.slice(at + 1).trim()) }
  for (const one of split(r.sel)) {
    const classes = (one.match(/\.[a-z][\w-]*/gi) ?? []).map((c) => c.slice(1))
    if (sheet === 'app' ? !classes.some((c) => DRAWN.has(c)) : classes.length > 0 && !classes.some((c) => DRAWN.has(c))) continue // cannot land on this markup
    const pseudo = /::([a-z-]+)$/.exec(one)?.[1] ?? null
    const base = (pseudo ? one.slice(0, -pseudo.length - 2) : one).replace(/:hover/g, '[data-hover]').replace(/:focus(-visible|-within)?/g, '[data-focus]').replace(/:disabled/g, '[disabled]')
    RULES.push({ sheet, sel: one, base, pseudo, decls, spec: specificity(one), order: order++, layered: r.at.some((a) => a.startsWith('@layer')), media: r.at.filter((a) => a.startsWith('@media')).map((a) => a.slice(6).trim()) })
  }
}
/** One media query list against a viewport. Anything this cannot read counts as not matching. */
function mediaMatches(query, env) {
  return split(query).some((q) => q.split(/\s+and\s+/).every((part) => {
    let m
    if ((m = /^\(max-width:\s*([\d.]+)px\)$/.exec(part))) return env.width <= Number(m[1])
    if ((m = /^\(min-width:\s*([\d.]+)px\)$/.exec(part))) return env.width >= Number(m[1])
    if ((m = /^\(pointer:\s*(coarse|fine)\)$/.exec(part))) return env.pointer === m[1]
    return false
  }))
}
/** A scene: the markup in one state, at one viewport, with the cascade resolved per element. */
function scene(o) {
  const doc = new JSDOM(html(o)).window.document
  const env = { width: o.width, pointer: o.pointer ?? 'coarse' }
  const live = RULES.filter((r) => r.media.every((q) => mediaMatches(q, env)))
  const matched = new Map()
  const rulesFor = (el, pseudo = null) => {
    const key = pseudo ?? ''
    if (!matched.has(el)) matched.set(el, new Map())
    const mine = matched.get(el)
    if (!mine.has(key)) mine.set(key, live.filter((r) => { if (r.pseudo !== pseudo) return false; try { return el.matches(r.base) } catch { return false } }))
    return mine.get(key)
  }
  /** The winning declaration among `props`, or undefined. Unlayered beats layered, then specificity, then order. */
  const prop = (el, props, pseudo = null) => {
    const names = [].concat(props)
    let best = null
    for (const r of rulesFor(el, pseudo)) for (const name of names) {
      if (!r.decls.has(name)) continue
      const rank = [r.layered ? 0 : 1, r.spec, r.order]
      if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] > best.rank[2])))) best = { rank, value: r.decls.get(name), name }
    }
    return best?.value
  }
  /** A custom property as the element inherits it. */
  const custom = (el, name) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = prop(n, name); if (v !== undefined) return { value: v, at: n } } return null }
  // The tokens the way the root resolves them: core.css, then the alias sheet after it (app/layout.tsx order),
  // each declaration ranked by its selector and then by order. A day lift on the bare root comes later than
  // core's night block at the same weight, so it holds at night too unless night re-declares it after.
  const tokens = new Map(), rank = new Map()
  for (const sheet of [core, lifts]) for (const r of scan(sheet)) for (const one of split(r.sel)) {
    const weight = one === ':root[data-design="frequency"]' ? 2 : one === '.dark[data-design="frequency"]' && o.dark ? 2 : one === ':root.dark[data-design="frequency"]' && o.dark ? 3 : one === ':root[data-design="frequency"]:not(.dark)' && !o.dark ? 3 : 0
    if (!weight) continue
    for (const d of split(r.body, ';')) {
      const colon = d.indexOf(':')
      if (colon < 1 || !d.slice(0, colon).trim().startsWith('--')) continue
      const k = d.slice(0, colon).trim()
      if ((rank.get(k) ?? 0) > weight) continue
      tokens.set(k, d.slice(colon + 1).trim()); rank.set(k, weight)
    }
  }
  /** A colour value to its candidates (a gradient gives every stop), through custom properties and tokens. */
  const parse = (el, value, seen = 0) => {
    value = (value ?? '').trim()
    if (!value || seen > 14) return []
    let m
    if ((m = /^var\((--[a-z0-9-]+)\s*(?:,(.*))?\)$/i.exec(value))) {
      const own = custom(el, m[1])
      if (own) return parse(own.at, own.value, seen + 1)
      if (tokens.has(m[1])) return parse(el, tokens.get(m[1]), seen + 1)
      return parse(el, m[2], seen + 1)
    }
    if (value === 'transparent' || value === 'none') return [[0, 0, 0, 0]]
    if ((m = /^#([0-9a-f]{3,8})$/i.exec(value))) {
      let h = m[1]
      if (h.length <= 4) h = [...h].map((c) => c + c).join('')
      return [[parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1]]
    }
    if ((m = /^rgba?\(([^()]*)\)$/i.exec(value))) { const n = m[1].split(/[,/\s]+/).filter(Boolean).map(Number); return [[n[0], n[1], n[2], n[3] ?? 1]] }
    if ((m = /^color-mix\((.*)\)$/i.exec(value))) {
      const [, a, b] = split(m[1])
      const pa = /^(.*?)\s+([\d.]+)%$/.exec(a)
      if (!pa || b !== 'transparent') return []
      return parse(el, pa[1], seen + 1).map((c) => [c[0], c[1], c[2], c[3] * (Number(pa[2]) / 100)])
    }
    if (/gradient\(/.test(value)) return [...value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^()]*\)|var\(--[a-z0-9-]+\)/gi)].flatMap((s) => parse(el, s[0], seen + 1))
    return []
  }
  const px = (v) => { const m = /^(-?[\d.]+)px$/.exec((v ?? '').trim()); return m ? Number(m[1]) : (v ?? '').trim() === '0' ? 0 : null }
  return { doc, prop, parse, px, $: (id) => doc.getElementById(id) ?? doc.querySelector(id) }
}

// ── 1 to 3. The phone. ──
const UPPER_EM = 0.58 // an upper bound for one character of the UI face at weight 600, in ems
const fontPx = (s, el) => { const v = s.prop(el, ['font', 'font-size']) ?? ''; const m = /(\d+(?:\.\d+)?)px/.exec(v); return m ? Number(m[1]) : 14 }
const sides = (s, el) => { const p = (s.prop(el, 'padding') ?? '0').split(/\s+/).map((x) => s.px(x) ?? 0); return [p[3] ?? p[1] ?? p[0], p[1] ?? p[0]] }
for (const width of [320, 360, 390]) for (const [lf, rf, state] of [['1', '0', 'the inspector open'], ['1', '1', 'both rails shut'], ['0', '1', 'the left rail open']]) for (const live of [false, true]) {
  const s = scene({ width, lf, rf, live })
  const where = `at ${width}px with ${state}${live ? ', after a publish' : ''}`
  const pe = s.$('.pe'), top = s.$('.top')
  // The grid: every fixed column must be an overlay's, which takes no room.
  const cols = split(s.prop(pe, 'grid-template-columns') ?? '', ' ').filter(Boolean)
  const fixed = cols.reduce((sum, c) => sum + (s.px(c) ?? 0), 0)
  if (cols.length !== 3) bad.push(`${where}: cannot read the grid's three columns (${cols.join(' ')})`)
  else if (fixed > 0 && !live) bad.push(`${where}: the grid keeps ${fixed}px of rail columns (${cols.join(' ')}), so the toolbar is ${Math.max(width, fixed)}px wide on a ${width}px screen${fixed > width ? ' and Publish runs off its right edge' : ' and the canvas loses that width'}`)
  for (const [id, open] of [['rail', lf === '0'], ['insp', rf === '0']]) {
    const el = s.$(id)
    if (open && s.prop(el, 'position') !== 'fixed') bad.push(`${where}: the open ${id === 'rail' ? 'left rail' : 'inspector'} is not an overlay`)
    if (!open && s.prop(el, 'visibility') !== 'hidden') bad.push(`${where}: the shut ${id === 'rail' ? 'left rail' : 'inspector'} is still drawn`)
  }
  // The canvas keeps the middle column: an open rail is fixed and leaves the grid, and auto-placement would
  // otherwise slide the canvas into the rail's empty first column.
  if (!live && !/^2(\s|\/|$)/.test(s.prop(s.$('stage'), 'grid-column') ?? '')) bad.push(`${where}: the canvas is not named into the middle column, so it takes the first free cell (the rail's, ${cols[0]} wide, when the rail is open over it)`)
  // The row: what cannot shrink must fit.
  const [padL, padR] = sides(s, top)
  const gap = s.px(s.prop(top, 'gap')) ?? 0
  let need = padL + padR, count = 0
  const parts = []
  for (const el of top.children) {
    if (s.prop(el, 'display') === 'none') continue
    const position = s.prop(el, 'position')
    if (position === 'absolute' || position === 'fixed') continue
    count++
    let w = 0
    if (el.classList.contains('ib')) w = Math.max(s.px(s.prop(el, 'width')) ?? 0, s.px(s.prop(el, 'min-width')) ?? 0)
    else if (el.classList.contains('btn')) {
      const [l, r] = sides(s, el)
      w = l + r + el.firstChild.textContent.trim().length * fontPx(s, el) * UPPER_EM
      const badge = el.querySelector('.pub-badge')
      if (badge) w += (s.px(s.prop(el, 'gap')) ?? 0) + (s.px(s.prop(badge, 'margin-left')) ?? 0) + badge.textContent.length * fontPx(s, badge) * UPPER_EM
    } else if (el.classList.contains('save')) { const dot = el.querySelector('i'); w = s.px(s.prop(dot, 'width')) ?? 0; if (s.prop(el.querySelector('span'), 'display') !== 'none') w = Infinity }
    else if (el.classList.contains('pick')) { if (s.prop(el, 'min-width') !== '0') w = s.px(s.prop(el.querySelector('button'), 'max-width')) ?? Infinity }
    else if (!el.classList.contains('sp')) w = Infinity
    parts.push(`${el.id || el.className}:${Math.round(w)}`)
    need += w
  }
  need += gap * Math.max(0, count - 1)
  if (need > width) bad.push(`${where}: the toolbar row needs ${Number.isFinite(need) ? Math.ceil(need) + 'px' : 'more room than it can give up'} and the screen is ${width}px, so Publish runs off the right edge (${parts.join(' ')})`)
  if (live) {
    const link = s.$('live')
    if (s.prop(link, 'display') === 'none' || s.prop(link, 'visibility') === 'hidden') bad.push(`${where}: "View live site" is hidden`)
    const out = ['absolute', 'fixed'].includes(s.prop(link, 'position'))
    if (out) {
      // Out of the row: the bar must be tall enough for the row and the link under it, and the overlays start below it.
      const bar = s.px(split(s.prop(pe, 'grid-template-rows') ?? '', ' ')[0]) ?? 0
      const row = Math.max(...[...top.children].map((el) => s.px(s.prop(el, 'min-height')) ?? 0)), linkH = Math.max(s.px(s.prop(link, 'min-height')) ?? 0, s.px(s.prop(link, 'height')) ?? 0)
      if (bar < row + linkH) bad.push(`${where}: "View live site" sits under the row but the bar is ${bar}px tall, short of the row (${row}px) and the link (${linkH}px)`)
      for (const [id, open] of [['rail', lf === '0'], ['insp', rf === '0']]) if (open && (s.px(s.prop(s.$(id), 'top')) ?? 0) < bar) bad.push(`${where}: the open ${id === 'rail' ? 'left rail' : 'inspector'} starts at ${s.prop(s.$(id), 'top')}, over the ${bar}px bar`)
    }
  }
  // The open rail shows its panel.
  if (lf === '0' && s.prop(s.$('rail-body'), 'display') === 'none') bad.push(`${where}: the open left rail hides its panel, leaving five icons and nothing to use`)
}
for (const [lf, rf, id, name] of [['0', '1', 'rail', 'left rail'], ['1', '0', 'insp', 'inspector']]) {
  const s = scene({ width: 390, lf, rf, live: false, dark: true })
  const el = s.$(id)
  const worst = Math.min(1, ...s.parse(el, s.prop(el, ['background', 'background-color'])).map((c) => c[3]))
  if (worst < 1) bad.push(`at 390px at night the open ${name} is ${Math.round(worst * 100)}% glass over the canvas: a light Site shows through and lifts the ground under its text`)
}

// ── 4. Small print, by day and at night. ──
const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1] }
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const inkSources = []
for (const dark of [false, true]) {
  const s = scene({ width: 1440, pointer: 'fine', lf: '0', rf: '0', live: false, dark })
  const when = dark ? 'at night' : 'by day'
  const root = s.$('[data-editor-root]')
  /** Every ground behind `el`: each ancestor's background from the editor root down, composited in order. */
  const grounds = (el) => {
    const chain = []
    for (let n = el; n && n !== root.parentElement; n = n.parentElement) chain.unshift(n)
    let out = [[255, 255, 255, 1]]
    for (const n of chain) {
      const v = s.prop(n, ['background', 'background-color'])
      if (v === undefined) continue
      const cands = s.parse(n, v)
      if (!cands.length) { if (!/^(none|transparent)$/.test(v)) bad.push(`cannot resolve the background of ${n.id || n.className} (${v})`); continue }
      out = out.flatMap((g) => cands.map((c) => over(c, g))).slice(0, 96)
    }
    return out
  }
  const opacity = (el) => { let o = 1; for (let n = el; n && n !== root.parentElement; n = n.parentElement) { const v = s.prop(n, 'opacity'); if (v !== undefined) o *= Number(v) } return o }
  const inherited = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = s.prop(n, 'color'); if (v !== undefined && v !== 'inherit') return { v, at: n } } return { v: 'var(--fq-text-body)', at: root } }
  const check = (label, el, inks, alpha = 1) => {
    if (!inks.length) { bad.push(`${label} ${when}: cannot resolve the ink`); return }
    let worst = Infinity, at = null, fg = null
    for (const g of grounds(el)) for (const i of inks) { const f = over([i[0], i[1], i[2], i[3] * alpha], g); const r = ratio(f, g); if (r < worst) { worst = r; at = g; fg = f } }
    if (worst < 4.5) bad.push(`${label} ${when}: ${hex(fg)} on ${hex(at)} is ${worst.toFixed(2)}:1, under 4.5:1`)
  }
  // Placeholders. With no colour declared a placeholder is the field's own ink at half strength (the reset's default).
  for (const [label, id] of [["Vera's placeholder", 'vera-input'], ['the block search placeholder', 'search-input'], ['a rail field placeholder', 'rail-in'], ['an inspector field placeholder', 'insp-in']]) {
    const el = s.$(id)
    const own = s.prop(el, 'color', 'placeholder')
    if (own !== undefined) { inkSources.push([`${label} ${when}`, own]); check(label, el, s.parse(el, own), opacity(el)) }
    else { const base = inherited(el); check(`${label} (no colour of its own, so half the field's ink)`, el, s.parse(base.at, base.v), 0.5 * opacity(el)) }
  }
  // The Header and Footer rows, at rest and hovered.
  for (const hover of [false, true]) {
    const t = scene({ width: 1440, pointer: 'fine', lf: '0', rf: '0', live: false, dark })
    if (hover) for (const id of ['chrome-row', 'on-row']) t.$(id).setAttribute('data-hover', '')
    for (const [label, id] of [["a Header or Footer row's detail", 'chrome-small'], ["a Header or Footer row's count", 'chrome-meta'], ["the chosen row's detail", 'on-small'], ["the chosen row's count", 'on-meta']]) {
      const el = t.$(id), v = t.prop(el, 'color')
      if (v === undefined) { bad.push(`${label}: no colour`); continue }
      inkSources.push([`${label} ${when}`, v])
      const tRoot = t.$('[data-editor-root]')
      let o = 1; for (let n = el; n && n !== tRoot.parentElement; n = n.parentElement) { const ov = t.prop(n, 'opacity'); if (ov !== undefined) o *= Number(ov) }
      let g = [[255, 255, 255, 1]]
      const chain = []; for (let n = el; n && n !== tRoot.parentElement; n = n.parentElement) chain.unshift(n)
      for (const n of chain) { const bv = t.prop(n, ['background', 'background-color']); if (bv === undefined) continue; const c = t.parse(n, bv); if (c.length) g = g.flatMap((x) => c.map((y) => over(y, x))).slice(0, 96) }
      let worst = Infinity, at = null, fg = null
      for (const ground of g) for (const i of t.parse(el, v)) { const f = over([i[0], i[1], i[2], i[3] * o], ground); const r = ratio(f, ground); if (r < worst) { worst = r; at = ground; fg = f } }
      if (worst < 4.5) bad.push(`${label}${hover ? ', hovered,' : ''} ${when}: ${hex(fg)} on ${hex(at)} is ${worst.toFixed(2)}:1, under 4.5:1`)
    }
  }
  // The change count on Publish, on every stop of the pastel.
  { const el = s.$('badge'); const base = inherited(el); check('the change count on Publish', el, s.parse(base.at, base.v), opacity(el)) }
  // The count and hint of the field being edited, on its lit ground.
  for (const [label, id] of [['the count of the field being edited', 'lit-count'], ['the hint of the field being edited', 'lit-hint']]) {
    const el = s.$(id), v = s.prop(el, 'color')
    if (v === undefined) { bad.push(`${label}: no colour`); continue }
    inkSources.push([`${label} ${when}`, v])
    check(label, el, s.parse(el, v), opacity(el))
  }
}

// ── 5. Shared tokens only. ──
for (const [label, value] of inkSources) {
  if (/#[0-9a-f]{3,8}\b|rgba?\(/i.test(value)) bad.push(`${label}: the ink is a literal colour (${value})`)
  for (const m of value.matchAll(/var\((--[a-z0-9-]+)/g)) if (!m[1].startsWith('--fq-')) bad.push(`${label}: reads ${m[1]}, not a shared --fq- token`)
}

if (bad.length) { console.error([...new Set(bad)].join('\n')); process.exit(1) }
console.log('LIVE-2518: ok')
