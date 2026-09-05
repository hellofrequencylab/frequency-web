// Source-shape tests pin CODE, not prose (scan2 L8-04 / L8-05, 2026-09-05).
//
// A source-shape test reads a file and asserts a token is in it. The files this repo pins are
// unusually well commented, and 34 assertions were found whose needle ALSO sits in a comment of
// the pinned file: delete the call and the test stays green, because the sentence explaining the
// call is still there. Four were proven by mutation (lib/platform-flags.test.ts, the /events
// horizon; lib/layout/unpublished-work.test.ts; lib/events/series-config.test.ts;
// lib/nearby/map-pins.test.ts). This helper is the fix: match against the file with its comments
// blanked, and optionally its import declarations too, so a needle can only hit the code that
// does the thing.
//
// The blanking preserves length and line breaks (comments become spaces), so any offset or line
// number a test derives from the stripped text still points at the same place in the real file.
//
// It is a scanner, not a parser: it tracks string, template and regex literals so a `//` inside
// 'https://…' or a `/*` inside a regex is never mistaken for a comment. That is enough for every
// file pinned today; it is not a TypeScript front end and does not try to be one.

import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

// A `/` after any of these is division (or a JSX closing tag), never the start of a regex.
const IDENT_TAIL = /[A-Za-z0-9_$\])}'"`<]/

/** Blank every `//` and `/* … *\/` comment in `source`, keeping length and newlines. */
export function stripComments(source: string): string {
  const out = source.split('')
  const n = source.length
  let i = 0
  // What the last significant (non-space, non-comment) character was, for the regex heuristic:
  // a `/` after an identifier, number, `)` or `]` is division; anywhere else it opens a regex.
  let lastSig = ''
  // Template literals nest through `${ … }`; this stack remembers how many braces are open in
  // each expression so the closing `}` that resumes the template is recognised.
  const templateDepth: number[] = []

  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }

  while (i < n) {
    const ch = source[i]
    const next = source[i + 1]

    // Resume a template literal when the `${ … }` expression closes.
    if (ch === '}' && templateDepth.length > 0 && templateDepth[templateDepth.length - 1] === 0) {
      templateDepth.pop()
      i = scanTemplate(source, i + 1, templateDepth)
      lastSig = '`'
      continue
    }
    if (templateDepth.length > 0) {
      if (ch === '{') templateDepth[templateDepth.length - 1]++
      else if (ch === '}') templateDepth[templateDepth.length - 1]--
    }

    if (ch === '/' && next === '/') {
      let j = i
      while (j < n && source[j] !== '\n') j++
      blank(i, j)
      i = j
      continue
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const j = end === -1 ? n : end + 2
      blank(i, j)
      i = j
      continue
    }
    if (ch === "'" || ch === '"') {
      i = scanQuoted(source, i, ch)
      lastSig = ch
      continue
    }
    if (ch === '`') {
      i = scanTemplate(source, i + 1, templateDepth)
      lastSig = '`'
      continue
    }
    if (ch === '/' && !IDENT_TAIL.test(lastSig)) {
      i = scanRegex(source, i)
      lastSig = '/'
      continue
    }
    if (!/\s/.test(ch)) lastSig = ch
    i++
  }
  return out.join('')
}

/** Index just past the closing quote of the string that opens at `start`. */
function scanQuoted(source: string, start: number, quote: string): number {
  let i = start + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote || ch === '\n') return i + 1
    i++
  }
  return i
}

/** Scan template text from `start` (just past a backtick or a closing `}`) until the template
 *  closes, or until a `${` opens an expression, which is pushed on `depth` for the caller. */
function scanTemplate(source: string, start: number, depth: number[]): number {
  let i = start
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '`') return i + 1
    if (ch === '$' && source[i + 1] === '{') {
      depth.push(0)
      return i + 2
    }
    i++
  }
  return i
}

/** Index just past a regex literal opening at `start`, honouring character classes and escapes. */
function scanRegex(source: string, start: number): number {
  let i = start + 1
  let inClass = false
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '\n') return i // not a regex after all; give up on the line
    if (inClass) {
      if (ch === ']') inClass = false
    } else if (ch === '[') inClass = true
    else if (ch === '/') {
      i++
      while (i < source.length && /[a-z]/i.test(source[i])) i++
      return i
    }
    i++
  }
  return i
}

/** Blank every static import / re-export declaration, keeping length and newlines. Dynamic
 *  `import(...)` calls are code and stay. Call on comment-stripped text, or a commented-out
 *  import will be blanked twice, which is harmless but pointless. */
export function stripImports(source: string): string {
  const re =
    /^[ \t]*(?:import|export)\s+(?:type\s+)?(?:[\w$*{][^;'"`]*?\s+from\s+)?['"][^'"\n]+['"]\s*;?/gm
  return source.replace(re, (m) => m.replace(/[^\n]/g, ' '))
}

/**
 * The source at `path` (absolute, or relative to `process.cwd()`), with comments blanked and,
 * when `imports` is set, static import declarations blanked as well. Use `imports: true` when
 * the assertion is about a CALL, so the import line of the same name cannot satisfy it.
 */
export function sourceWithoutComments(path: string, opts: { imports?: boolean } = {}): string {
  const abs = isAbsolute(path) ? path : join(process.cwd(), path)
  const stripped = stripComments(readFileSync(abs, 'utf8'))
  return opts.imports ? stripImports(stripped) : stripped
}
