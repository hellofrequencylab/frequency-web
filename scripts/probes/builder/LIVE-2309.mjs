// LIVE-2309 (child of LIVE-EDITOR-SHELL): the website editor's chrome is readable at night.
// The generated kit (app/themes/frequency/kit-editor.css) paints its surfaces and washes as day literals while
// its text reads shared tokens that turn cream at night, so night drew cream on white. This probe does not look
// for a rule by name. It resolves, from the three sheets, the colour each chrome surface and each ink ends up
// with at night (night rule over day rule, token through the night block of core.css, glass and washes
// composited over what is under them) and measures the WCAG contrast of every pair the chrome draws:
//   1. text on the toolbar, the rails, the menus, the dialog and the cards, and on every wash laid over them;
//   2. the lit, pressed and hovered states (a chosen segment, a pressed toolbar button, a lit row, the toast,
//      the presence initials on the pastel, the switch knob on its track);
//   3. the shared field form's primary pair, which the editor pins on .pe;
//   4. the Site's inherited ink cannot reach the chrome (lib/sites/editor/theme.ts sets it on the same element);
//   5. the fence: the night rules name nothing inside the canvas frame, hold no literal colour, and the tone
//      swatches read the Site's own contract instead of a name the chrome pins back to Frequency.
// Run: node scripts/probes/builder/LIVE-2309.mjs
import fs from 'node:fs'

const bad = []
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const core = strip(fs.readFileSync('app/themes/frequency/core.css', 'utf8'))
const lifts = strip(fs.readFileSync('app/themes/frequency.css', 'utf8'))
const kit = strip(fs.readFileSync('app/themes/frequency/kit-editor.css', 'utf8'))
const shell = strip(fs.readFileSync('app/themes/frequency/editor-shell.css', 'utf8'))
const siteTokens = fs.readFileSync('lib/sites/editor/theme.ts', 'utf8')

/** Every style rule with the at-rules that wrap it. */
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
/** Split on a separator that is not inside brackets. */
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
const decls = (body) => {
  const out = new Map()
  for (const d of split(body, ';')) { const at = d.indexOf(':'); if (at > 0) out.set(d.slice(0, at).trim(), d.slice(at + 1).trim()) }
  return out
}

// ── The tokens, by day and at night (the app's night is `.dark` on the root). ──
//    core.css is the export; app/themes/frequency.css then lifts a few of its inks for contrast, and wins.
const DAY = new Map(), NIGHT = new Map()
for (const sheet of [core, lifts]) for (const r of scan(sheet)) for (const one of split(r.sel)) {
  const into = one === ':root[data-design="frequency"]' ? DAY : one === '.dark[data-design="frequency"]' || one === ':root.dark[data-design="frequency"]' ? NIGHT : null
  if (into) for (const [k, v] of decls(r.body)) if (k.startsWith('--')) into.set(k, v)
}
if (!NIGHT.size) bad.push('core.css has no night block to resolve against')
const token = (name) => NIGHT.get(name) ?? DAY.get(name)

// ── The chrome's cascade: the kit, then the hand-kept sheet; a night rule outranks a day rule. ──
const DP = '[data-design="frequency"] [data-kit="editor"]'
const NP = '.dark' + DP
const tiers = { day: new Map(), night: new Map() }
const nightRules = []
let rootUnlayered = null
for (const [name, sheet] of [['kit', kit], ['shell', shell]]) for (const r of scan(sheet)) {
  if (r.at.some((a) => a.startsWith('@media') || a.startsWith('@container') || a.startsWith('@keyframes'))) continue
  const body = decls(r.body)
  for (const one of split(r.sel)) {
    const night = one.startsWith(NP)
    if (!night && !one.startsWith(DP)) continue
    const rest = one.slice((night ? NP : DP).length).trim()
    if (night) nightRules.push({ sel: one, body: r.body })
    if (!night && rest === '' && name === 'shell' && !r.at.some((a) => a.startsWith('@layer'))) rootUnlayered = body
    const m = /^:is\((.*)\)$/.exec(rest)
    for (const target of m ? split(m[1]) : [rest]) {
      const tier = tiers[night ? 'night' : 'day']
      if (!tier.has(target)) tier.set(target, new Map())
      for (const [k, v] of body) tier.get(target).set(k === 'background-color' ? 'background' : k, v)
    }
  }
}
const get = (target, prop) => tiers.night.get(target)?.get(prop) ?? tiers.day.get(target)?.get(prop)

// ── Colours. A value resolves to one or more candidates (a gradient gives every stop). ──
function parse(value, seen = 0) {
  value = (value ?? '').trim()
  if (!value || seen > 12) return []
  let m
  if ((m = /^var\((--[a-z0-9-]+)\s*(?:,(.*))?\)$/i.exec(value))) { const v = token(m[1]); return v ? parse(v, seen + 1) : parse(m[2], seen + 1) }
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
    return parse(pa[1], seen + 1).map((c) => [c[0], c[1], c[2], c[3] * (Number(pa[2]) / 100)])
  }
  if (/gradient\(/.test(value)) return [...value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^()]*\)|var\(--[a-z0-9-]+\)/gi)].flatMap((s) => parse(s[0], seen + 1))
  return []
}
const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1] }
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** What the eye sees behind something drawn on these targets, stacked bottom to top over the editor root. */
function ground(stack) {
  let grounds = parse(rootUnlayered?.get('background') ?? get('', 'background')).map((c) => over(c, [0, 0, 0, 1]))
  if (!grounds.length) { bad.push('the editor root has no ground to composite on'); grounds = [[0, 0, 0, 1]] }
  for (const target of stack) {
    const value = get(target, 'background')
    const cands = parse(value)
    if (!cands.length) { bad.push(`cannot resolve the background of "${target}" (${value ?? 'none declared'})`); continue }
    grounds = grounds.flatMap((g) => cands.map((c) => over(c, g))).slice(0, 96)
  }
  return grounds
}
/** The worst contrast of an ink over a stack. */
function check(label, stack, ink, min) {
  const inks = parse(ink)
  if (!inks.length) { bad.push(`${label}: cannot resolve the ink (${ink ?? 'none declared'})`); return }
  let worst = Infinity, at = null, fg = null
  for (const g of ground(stack)) for (const i of inks) { const f = over(i, g); const r = ratio(f, g); if (r < worst) { worst = r; at = g; fg = f } }
  if (worst < min) bad.push(`${label}: ${hex(fg)} on ${hex(at)} is ${worst.toFixed(2)}:1 at night, under ${min}:1`)
}
const T = (name) => `var(--fq-text-${name})`

// 1. Text on each surface, and on each wash over it.
for (const [label, stack] of [['toolbar', ['.top']], ['rail', ['.rail']], ['inspector', ['.insp']], ['page menu', ['.top', '.menu']], ['dialog', ['.modal']], ['block card', ['.rail', '.blk']], ['theme card', ['.rail', '.theme']], ['option tile', ['.insp', '.opts button']], ['zoom pill', ['.zoom']], ['Vera reply', ['.vera .reply']]]) {
  check(`strong text on the ${label}`, stack, T('strong'), 4.5)
  check(`body text on the ${label}`, stack, T('body'), 4.5)
  check(`muted text on the ${label}`, stack, T('muted'), 4.5)
}
check('caption text on the rail', ['.rail'], get('.cap', 'color'), 4.5)
check('the page picker label', ['.top', '.pick>button'], get('.pick>button', 'color'), 4.5)
check('the page picker label, hovered', ['.top', '.pick>button:hover'], get('.pick>button', 'color'), 4.5)
check('an unchosen segment in the toolbar', ['.top', '.seg'], T('muted'), 4.5)
check('an unchosen segment in the inspector', ['.insp', '.seg'], T('muted'), 4.5)
check('the block search text', ['.rail', '.search'], T('body'), 4.5)
check('a field in the rail', ['.rail', '.in'], get('.in', 'color'), 4.5)
check('a row icon on its tile', ['.rail', '.row .ic'], get('.row .ic', 'color'), 3)
check('a Vera suggestion chip', ['.vera .reply', '.vera .chips button'], get('.vera .chips button', 'color'), 4.5)
check('a toolbar icon, hovered', ['.top', '.ib:hover'], get('.ib', 'color'), 3)

// 2. Lit, pressed and hovered states.
check('the chosen segment', ['.insp', '.seg', '.seg button.on'], get('.seg button.on', 'color'), 4.5)
check('a pressed toolbar button', ['.top', '.ib[aria-pressed="true"]'], get('.ib[aria-pressed="true"]', 'color'), 4.5)
check('the ink button', ['.modal', '.btn.ink'], get('.btn.ink', 'color'), 4.5)
check('the toast', ['.toast'], get('.toast', 'color'), 4.5)
check('presence initials on the pastel', ['.top', '.faces span'], get('.faces span', 'color'), 4.5)
check('a lit row title', ['.rail', '.row.on'], get('.rail .row .t', 'color'), 4.5)
check('a lit row detail', ['.rail', '.row.on'], get('.rail .row .t small', 'color'), 4.5)
check('a lit row count', ['.rail', '.row.on'], get('.rail .row .meta', 'color'), 4.5)
check('a hovered row detail', ['.rail', '.row:hover'], get('.rail .row .t small', 'color'), 4.5)
check('the icon on a lit row', ['.rail', '.row.on', '.row.on .ic'], get('.row .ic', 'color'), 3)
check('the switch knob on its track', ['.insp', '.sw'], get('.sw::after', 'background'), 3)
check('the switch knob when on', ['.insp', '.sw.on'], get('.sw.on::after', 'background') ?? get('.sw::after', 'background'), 3)
check('a field count beside its label', ['.insp'], get('.fields [data-field] label>em', 'color'), 4.5)

// 3. The shared field form's primary pair, as .pe pins it.
const primary = get('.pe', '--color-primary'), onPrimary = get('.pe', '--color-text-on-primary')
const pc = parse(primary)[0], oc = parse(onPrimary)[0]
if (!pc || !oc) bad.push('the editor does not pin the field form\'s primary pair on .pe')
else {
  if (ratio(oc, pc) < 4.5) bad.push(`the field form's primary button: ${hex(oc)} on ${hex(pc)} is ${ratio(oc, pc).toFixed(2)}:1 at night, under 4.5:1`)
  for (const g of ground(['.insp'])) if (ratio(pc, g) < 3) { bad.push(`the field form's primary ${hex(pc)} on the inspector ${hex(g)} is ${ratio(pc, g).toFixed(2)}:1 at night, under 3:1`); break }
}

// 4. The Site's inherited ink. theme.ts puts background and color on [data-website-theme], the editor root itself,
//    unlayered; only an unlayered, more specific rule keeps the chrome's own.
if (/\[data-website-theme\]\{[^}]*\bcolor:var\(--th-text\)/.test(siteTokens)) {
  for (const prop of ['color', 'background']) {
    const v = rootUnlayered?.get(prop) ?? ''
    if (!/^var\(--fq-[a-z0-9-]+\)$/.test(v)) bad.push(`the editor root takes its ${prop} from the Site (lib/sites/editor/theme.ts): no unlayered rule on the root sets it to a shared --fq- token`)
  }
}

// 5. The fence, and tokens only.
const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(/i
const INSIDE_FRAME = /\.frame\b|\.we-canvas-root|\.we-section|\.sec\b|\.s-[a-z]|\.tone-|iframe|\.hs-|\[data-website-theme\]/
for (const r of nightRules) {
  if (LITERAL.test(r.body)) bad.push(`night rule "${r.sel.slice(NP.length).trim()}" holds a literal colour`)
  if (INSIDE_FRAME.test(r.sel)) bad.push(`night rule "${r.sel.slice(NP.length).trim()}" names something inside the canvas frame`)
  for (const m of r.body.matchAll(/var\((--[a-z0-9-]+)/g)) if (!m[1].startsWith('--fq-')) bad.push(`night rule "${r.sel.slice(NP.length).trim()}" reads ${m[1]}, not a shared --fq- token`)
}
const pinned = [...(tiers.day.get('.pe') ?? new Map()).keys()].filter((k) => k.startsWith('--color-'))
for (const tone of ['white', 'sand', 'pastel', 'ink']) {
  const v = get(`.opts i[data-tone="${tone}"]`, 'background') ?? ''
  const reads = [...v.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])
  if (!reads.length) bad.push(`the ${tone} tone swatch draws nothing`)
  for (const name of reads) if (pinned.includes(name)) bad.push(`the ${tone} tone swatch reads ${name}, which the chrome pins back to Frequency: it shows the editor's surface, not the Site's`)
}

if (bad.length) { console.error([...new Set(bad)].join('\n')); process.exit(1) }
console.log('LIVE-2309: ok')
