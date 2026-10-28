// DESIGN-SYSTEM INTAKE: the pure half (docs/DESIGN-SYSTEM-INTAKE.md).
//
// A theme's design system arrives as a folder of hundreds of files. This module is how every one of them is
// accounted for: each file matches exactly one RULE (built here, mirrored from the repo, compared byte for byte,
// token-checked, copy-checked, or reference-only with a reason). A file no rule claims is a file somebody missed,
// and that is a failure, not a warning. Nothing here reads the network or the DS folder unless handed its path,
// so the same functions run from the CLI (scripts/ds-intake.mjs) and from vitest (scripts/design-system.test.ts).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix, relative } from 'node:path'

/** Rule kinds, loosest to strictest. A rule says what must be true of the repo for every file it claims. */
export const KINDS = ['skip', 'reference', 'mirror', 'asset', 'tokens', 'copy', 'built']

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** Every file under `dir`, as forward-slash paths relative to it, sorted. */
export function walk(dir) {
  const out = []
  const go = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) go(p)
      else if (e.isFile()) out.push(relative(dir, p).split('\\').join('/'))
    }
  }
  go(dir)
  return out.sort()
}

/** `**` crosses folders, `*` stays inside one, everything else is literal. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*'
      i++
      if (glob[i + 1] === '/') i++
    } else if (c === '*') re += '[^/]*'
    else if ('.+^${}()|[]\\?'.includes(c)) re += '\\' + c
    else re += c
  }
  return new RegExp('^' + re + '$')
}

/** The first rule whose glob claims `path`, or null. Order in rules.json is the precedence. */
export function ruleFor(rules, path) {
  for (const r of rules) if (globToRegExp(r.glob).test(path)) return r
  return null
}

/** `{base}` / `{path}` / `{name}` in a rule target, resolved for one DS file. */
export function resolveTarget(target, path) {
  const base = posix.basename(path)
  const name = base.replace(/\.[^.]+$/, '')
  return target.replaceAll('{base}', base).replaceAll('{name}', name).replaceAll('{path}', path)
}

/** Custom properties declared in a CSS file, keyed `selector|--name`. Comments are dropped first. */
export function extractTokens(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = {}
  const block = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = block.exec(text))) {
    const sel = m[1].trim().replace(/\s+/g, ' ')
    if (sel.startsWith('@')) continue
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':')
      if (i < 0) continue
      const name = d.slice(0, i).trim()
      if (!name.startsWith('--')) continue
      out[`${sel}|${name}`] = d.slice(i + 1).trim().replace(/\s+/g, ' ')
    }
  }
  return out
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×', copy: '©', larr: '←', rarr: '→' }
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENT[e.toLowerCase()] ?? all
  })
}

/** Remove every `<tag ...> ... </tag >` block by scanning, not by regexp, so a closing tag with spaces or odd case still ends it. */
function stripBlocks(text, tag) {
  const lower = text.toLowerCase()
  let out = ''
  let i = 0
  for (;;) {
    const open = lower.indexOf(`<${tag}`, i)
    if (open < 0) return out + text.slice(i)
    out += text.slice(i, open)
    const close = lower.indexOf(`</${tag}`, open)
    if (close < 0) return out
    const end = lower.indexOf('>', close)
    if (end < 0) return out
    i = end + 1
  }
}

/** What a visitor can read in a prototype: text nodes of HTML/JSX plus the sentences in its data files. */
export function extractCopy(source, file) {
  const found = new Set()
  const keep = (s) => {
    const t = decode(s).replace(/\s+/g, ' ').trim()
    if (t.length >= 16 && t.split(' ').length >= 3 && /[a-z]/i.test(t) && !/[{}=;]|=>|function|\bconst\b|\breturn\b|https?:|\.(png|jpg|css|js|svg)\b|var\(|\d(px|rem|vw|vh|ms|em)\b|minmax|repeat\(|gradient|rgba?\(|calc\(|cubic|ease-|transform|@ds-adherence|^\/\//.test(t)) found.add(t)
  }
  let text = source
  if (file.endsWith('.html')) text = stripBlocks(stripBlocks(text, 'style'), 'template')
  // Text between tags (HTML and JSX).
  const nodes = /(?:^|>)([^<>{}]+)(?=<|$)/g
  let m
  while ((m = nodes.exec(file.endsWith('.html') ? stripBlocks(text, 'script') : text))) keep(m[1])
  // Sentences in string literals (data files, JSX props, inline scripts).
  const strings = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g
  while ((m = strings.exec(text))) keep(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'))
  return [...found].sort()
}

/** The comparison form of a sentence: case, quotes, dashes, markup stars and punctuation do not count. */
export function squash(s) {
  return s
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Resolve var() chains inside one flat name→value map. Unresolvable references are left as written. */
export function resolveVars(map) {
  const seen = (name, depth = 0) => {
    const v = map[name]
    if (v === undefined || depth > 12) return undefined
    return v.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (all, n, fb) => {
      const r = seen(n, depth + 1)
      return r ?? fb ?? all
    })
  }
  return Object.fromEntries(Object.keys(map).map((k) => [k, seen(k)]))
}

/** Normalised value for comparison: hex lowercase, one space, no space before commas. */
export function normValue(v) {
  const num = (n) => String(Number(n)).replace(/^0\./, '.').replace(/^-0\./, '-.')
  return v
    .replace(/#[0-9a-fA-F]{3,8}\b/g, (h) => h.toLowerCase())
    // rgb(1 2 3 / .5) and rgba(1,2,3,.5) are one colour
    .replace(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+))?\s*\)/g, (_, r, g, b, a) => (a === undefined || Number(a) === 1 ? `rgb(${r},${g},${b})` : `rgb(${r},${g},${b},${num(a)})`))
    .replace(/(?<![\w.#-])0?\.(\d)/g, '.$1')
    .replace(/(?<![\w.])0px\b/g, '0')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

/** Flat map for one scope of the DS token snapshot (`:root`, or `[data-kit="coaches"]`). */
export function scopeMap(tokens, scope) {
  const out = {}
  for (const [k, v] of Object.entries(tokens)) {
    const i = k.indexOf('|')
    if (k.slice(0, i) === scope) out[k.slice(i + 1)] = v
  }
  return out
}

/** Repo CSS text → flat map of every `--name: value` it declares (any selector; later wins). */
export function flatDeclarations(css) {
  const out = {}
  for (const [k, v] of Object.entries(extractTokens(css))) out[k.slice(k.indexOf('|') + 1)] = v
  return out
}

/**
 * The repo-side verdicts for one theme. `read(path)` returns repo file text (or null), `bytes(path)` returns a
 * Buffer (or null). Returns violations only: an empty array is a green design system.
 *
 *   uncovered  – a snapshot file no rule claims
 *   missing    – a rule's repo target does not exist
 *   hash       – an asset's bytes differ from the design system's
 *   token      – a design-system token whose value is not what the repo resolves to
 *   copy       – a design-system sentence that no repo target carries
 *
 * `baseline` lists known violations as `kind:key`; one that no longer fires is itself a violation ("healed"),
 * so the list can only shrink.
 */
export function repoViolations({ rules, inventory, tokens, copy, tokenMap = [], repoTokenCss, read, bytes, exists, baseline = [] }) {
  const v = []
  const add = (kind, key, detail) => v.push({ kind, key, id: `${kind}:${key}`, detail })
  for (const f of inventory) {
    const rule = ruleFor(rules, f.path)
    if (!rule) {
      add('uncovered', f.path, 'no rule claims this file')
      continue
    }
    if (rule.kind === 'skip' || rule.kind === 'reference') {
      if (!rule.reason) add('missing', f.path, `${rule.kind} rule ${rule.glob} needs a reason`)
      continue
    }
    const targets = (rule.targets ?? (rule.target ? [rule.target] : [])).map((t) => resolveTarget(t, f.path))
    if (rule.kind !== 'tokens' && rule.kind !== 'copy' && !targets.length) add('missing', f.path, `${rule.kind} rule ${rule.glob} names no target`)
    for (const t of targets) {
      if (!(exists ? exists(t) : bytes(t) !== null)) {
        add('missing', f.path, `target ${t} does not exist`)
        continue
      }
      if (rule.kind === 'asset' && sha256(bytes(t)) !== f.sha256) add('hash', f.path, `${t} differs from the design system file`)
    }
  }
  // Tokens: the root scope, name-mapped, resolved on both sides.
  if (repoTokenCss && tokens) {
    const ds = resolveVars(scopeMap(tokens, ':root'))
    const repo = resolveVars(flatDeclarations(repoTokenCss))
    for (const [name, value] of Object.entries(ds)) {
      if (value === undefined) continue
      let mapped = name
      for (const { from, to } of tokenMap) if (name.startsWith(from)) { mapped = to + name.slice(from.length); break }
      if (name.startsWith('--accent-') || name.startsWith('--font-') || name === '--kit-hero-tone') continue
      const got = repo[mapped] ?? repo[name]
      if (got === undefined) add('token', name, `${mapped} is not declared in the repo token block (design system: ${value})`)
      else if (normValue(got) !== normValue(value)) add('token', name, `${mapped} is ${got}, design system says ${value}`)
    }
  }
  // Copy: every sentence of every copy-checked source must appear in one of its rule's targets.
  if (copy) {
    const hay = new Map()
    const hayFor = (rule, path) => {
      const targets = (rule.targets ?? []).map((t) => resolveTarget(t, path))
      const key = targets.join('|')
      if (!hay.has(key)) hay.set(key, squash(targets.map((t) => read(t) ?? '').join('\n')))
      return hay.get(key)
    }
    for (const [path, sentences] of Object.entries(copy)) {
      const rule = ruleFor(rules, path)
      if (!rule || !rule.targets) continue
      const h = hayFor(rule, path)
      for (const s of sentences) if (!h.includes(squash(s))) add('copy', `${path}#${sha256(s).slice(0, 8)}`, s)
    }
  }
  const set = new Set(baseline)
  const fired = new Set(v.map((x) => x.id))
  const fresh = v.filter((x) => !set.has(x.id))
  const healed = baseline.filter((id) => !fired.has(id))
  return { all: v, fresh, healed }
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function fileExists(p) {
  return existsSync(p) && statSync(p).isFile()
}
