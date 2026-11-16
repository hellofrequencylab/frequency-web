// LIVE-2308 (absorbing SCAN-862): the website editor sheet reads the shared Frequency tokens instead of its own
// drifted copy of them. Measured from the sheets, the way a browser resolves them:
//   1. on the editor root every colour role resolves through a shared --fq-* token that core.css declares by day,
//      and the roles that turn at night point at a token the night block re-declares (so night is not a copy);
//   2. the canvas root, where the SITE renders, sets no bare name: nothing the editor declares there can reach the
//      Site's own content (--text-body, the app's type step, used to become a colour inside the canvas);
//   3. the selection chrome inside the frame reads only names the canvas root declares, each with a fallback the
//      frame can draw from when the --fq-* copy did not run, and the fallback ink is the palette's own value;
//   4. every name a chrome rule reads is declared for the chrome, so no rule falls through to the Site's colour;
//   5. the inspector's lit row no longer wears the Site's accent.
// Run: node scripts/probes/builder/LIVE-2308.mjs
import fs from 'node:fs'

const bad = []
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(fs.readFileSync('components/sites/editor/editor.css', 'utf8'))
const core = strip(fs.readFileSync('app/themes/frequency/core.css', 'utf8'))

/** Every flat rule as [selector, body]; at-rule wrappers are transparent because the bodies hold no braces. */
const rules = (src) => [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]])
/** Custom properties declared by the rules whose selector list contains `selector` exactly. */
function declared(src, selector) {
  const out = new Map()
  for (const [sel, body] of rules(src)) {
    if (!sel.split(',').map((s) => s.trim()).includes(selector)) continue
    for (const d of body.split(';')) {
      const at = d.indexOf(':')
      if (at > 0 && d.slice(0, at).trim().startsWith('--')) out.set(d.slice(0, at).trim(), d.slice(at + 1).trim())
    }
  }
  return out
}
const reads = (value) => [...value.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1])
const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(/i

const DAY = declared(core, ':root[data-design="frequency"]')
const NIGHT = declared(core, '.dark[data-design="frequency"]')
const chrome = declared(css, '[data-editor-root]')
const canvas = declared(css, '.we-canvas-root')

// 1. The chrome's colour roles are the shared tokens.
const ROLES = ['--surface-card', '--surface-raised', '--text-strong', '--we-text-body', '--text-muted', '--text-faint', '--border-hair', '--border-strong', '--x-violet-deep', '--focus-ring', '--success', '--warning', '--danger', '--pa', '--pa-soft']
const TURNS_AT_NIGHT = ['--surface-card', '--surface-raised', '--text-strong', '--we-text-body', '--text-muted', '--text-faint', '--border-hair', '--border-strong', '--x-violet-deep', '--focus-ring']
for (const role of ROLES) {
  const value = chrome.get(role)
  if (!value) { bad.push(`the editor root does not declare ${role}`); continue }
  const m = /^var\((--fq-[a-z0-9-]+)\)$/.exec(value)
  if (!m) { bad.push(`${role} on the editor root is "${value}", not a shared --fq- token`); continue }
  if (!DAY.has(m[1])) bad.push(`${role} reads ${m[1]}, which core.css does not declare by day`)
  if (TURNS_AT_NIGHT.includes(role) && !NIGHT.has(m[1])) bad.push(`${role} reads ${m[1]}, which the night block does not re-declare`)
}
for (const [name, value] of chrome) if (LITERAL.test(value)) bad.push(`${name} on the editor root holds a literal colour: ${value}`)
// The app owns these two names (app/globals.css): the chrome must not re-declare them over the kit components it hosts.
for (const name of ['--text-body', '--ease-out']) if (chrome.has(name)) bad.push(`the editor root re-declares the app's own ${name}`)

// 2. Nothing bare on the canvas root.
if (!canvas.size) bad.push('the canvas root declares no editor tokens')
for (const name of canvas.keys()) if (!name.startsWith('--we-')) bad.push(`the canvas root sets ${name}: a bare name there reaches the Site's own content`)

// 3. Inside the frame: only declared names, each drawable without the copied tokens.
for (const [sel, body] of rules(css)) {
  if (!sel.includes('.we-canvas-root') || sel.trim() === '.we-canvas-root') continue
  for (const name of reads(body)) if (!canvas.has(name)) bad.push(`"${sel.slice(0, 60)}" reads ${name}, which the canvas root does not declare (it would draw nothing in the frame)`)
  if (LITERAL.test(body)) bad.push(`"${sel.slice(0, 60)}" holds a literal colour`)
}
for (const [name, value] of canvas) {
  const m = /^var\((--fq-[a-z0-9-]+)(?:,(.+))?\)$/.exec(value)
  if (!m) continue
  if (!m[2]) bad.push(`${name} on the canvas root reads ${m[1]} with no fallback: the frame only has --fq- values that canvas.tsx copied in`)
  else if (LITERAL.test(m[2]) && (DAY.get(m[1]) ?? '').toLowerCase() !== m[2].trim().toLowerCase()) bad.push(`${name} falls back to ${m[2]}, but ${m[1]} is ${DAY.get(m[1])} in core.css`)
  if (NIGHT.has(m[1])) bad.push(`${name} on the canvas root reads ${m[1]}, which turns at night; the ring sits on the Site's surface and must not`)
}
const ink = canvas.get('--we-ink') ?? ''
if (!/^var\(--fq-ink,/.test(ink)) bad.push('the selection ink in the frame must be the palette ink (--fq-ink) with a fallback')

// 4. Every name a chrome rule reads is declared for the chrome.
const shell = declared(css, '.we-shell')
const EXTERNAL = /^--(?:fq|th|ed|we|color)-|^--surface$/ // shared tokens, the Site's contract (theme swatches), a fallback-carrying read
for (const [sel, body] of rules(css)) {
  if (sel.includes('.we-canvas-root')) continue
  for (const d of body.split(';')) {
    const at = d.indexOf(':')
    if (at < 0) continue
    for (const name of reads(d.slice(at + 1))) {
      if (chrome.has(name) || shell.has(name) || EXTERNAL.test(name)) continue
      bad.push(`"${sel.slice(0, 60)}" reads ${name}, which nothing declares for the chrome`)
    }
  }
}
for (const name of ['--we-ink', '--we-on-ink', '--we-shadow', '--we-ease-out']) if (!chrome.has(name)) bad.push(`the editor root does not declare ${name}`)

// 5. The lit row in the inspector wears the editor's ink, not the Site's accent.
const inspector = fs.readFileSync('components/sites/editor/inspector.tsx', 'utf8')
const lit = [...inspector.matchAll(/\.we-inspector \[data-field=[^`]*`/g)].map((m) => m[0])
if (!lit.length) bad.push('the inspector no longer draws the lit row this probe measures')
for (const rule of lit) for (const name of reads(rule)) if (!chrome.has(name)) bad.push(`the inspector's lit row reads ${name}, which is not an editor token (--th-* is the Site's)`)

if (bad.length) { console.error([...new Set(bad)].join('\n')); process.exit(1) }
console.log('LIVE-2308: ok')
