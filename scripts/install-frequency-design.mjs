#!/usr/bin/env node
// INSTALL THE FREQUENCY DESIGN SYSTEM (ADR-1740). One command takes a Claude Design export and makes it
// the Frequency design the platform can switch to (lib/theme/design.ts):
//
//   pnpm design:install "~/Downloads/Frequency Design System.zip"     (or an unzipped folder)
//
// What it does, every time, from scratch (re-running with a newer export replaces the old one):
//   1. VENDORS the export's locked core into design_handoff/frequency/ (tokens, styles, guidelines,
//      templates, icons, logo), verbatim, so a reviewer can diff one export against the next. Photos and
//      b-roll stay out of git (tens of MB); the README lists where they came from.
//   2. GENERATES app/themes/frequency/core.css from the core tokens and base.css:
//        - every custom property is renamed into the `--fq-` namespace. The export's names collide with
//          the app's (`--text-body` is a font size here and a COLOUR there; `--accent`, `--ease-out`,
//          `--font-sans`, `--text-meta`, `--radius-*` too), so they cannot share one namespace.
//        - every selector is scoped to `[data-design="frequency"]`: the day/Commons tokens to the root,
//          Commons-at-night to `.dark`, Stage to `[data-surface="stage"]` inside it, energy to
//          `[data-energy]` inside it. Nothing applies until the design is switched on.
//        - element defaults go in `@layer base`, so the app's utility classes still win.
//        - the Google Fonts @import is dropped: faces load through next/font
//          (lib/theme/design-fonts/frequency.ts).
//   3. COPIES the wordmark, round icon and icon sprite to public/brand/frequency/.
//
// It never edits app/themes/frequency.css (the hand-kept alias layer that points the app's names at the
// `--fq-` ones) and never switches the design on. `pnpm design:use frequency` does that.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const ROOT = process.cwd()
const VENDOR = join(ROOT, 'design_handoff/frequency')
const OUT_DIR = join(ROOT, 'app/themes/frequency')
const OUT = join(OUT_DIR, 'core.css')
const PUBLIC = join(ROOT, 'public/brand/frequency')
const D = '[data-design="frequency"]'

/** Rename every custom property, declared or read, into the --fq- namespace. Idempotent. */
export function namespace(css) {
  return css.replace(/--(?!fq-)([a-zA-Z0-9_-]+)/g, '--fq-$1')
}

/** Map one selector from the export onto the scoped one. Returns null to drop the rule. */
export function scopeSelector(sel) {
  const s = sel.trim()
  if (s === ':root' || s === '[data-theme="commons"]') return `:root${D}`
  if (s === '[data-theme="commons"][data-time="night"]') return `.dark${D}`
  // colors.css carries two night CANDIDATES (UV, Thermal) for review; themes.css decides them per theme,
  // so the candidate blocks are not installed.
  if (s.startsWith('[data-time="night"]')) return null
  const energy = s.match(/^\[data-energy="(still|flow|charge)"\]$/)
  if (energy) return `${D} [data-energy="${energy[1]}"]`
  const stage = s.match(/^\[data-theme="stage"\](\[data-energy="(still|flow|charge)"\])?$/)
  if (stage) return `${D} [data-surface="stage"]${stage[1] ?? ''}, ${D}[data-surface="stage"]${stage[1] ?? ''}`
  if (s === 'html') return `:root${D}`
  if (s === 'body') return `${D} body`
  if (/^(h[1-6]|p|a|a:hover|em\.serif|\.serif|:focus-visible)$/.test(s)) return `${D} ${s}`
  // The design system's own classes (.fq-*) keep their names: they only apply where a component uses
  // them, and every value they read is now an --fq- token.
  if (/^\.fq-|^@keyframes|^(from|to|\d+%)/.test(s)) return s
  // A component rule that names a surface: Stage is `data-surface="stage"` in the app, Commons is the
  // default (no marker), so `[data-theme="commons"] .x` is simply `.x`.
  if (/\[data-theme="stage"\]\s/.test(s)) return `${D} ${s.replace(/\[data-theme="stage"\]\s/g, '[data-surface="stage"] ')}`
  if (/^\[data-theme="commons"\]\s/.test(s)) return `${D} ${s.replace(/^\[data-theme="commons"\]\s+/, '')}`
  return `${D} ${s}`
}

/** Rewrite a token or base sheet: strip @import, namespace properties, scope every selector list. */
export function transform(css, { layer } = {}) {
  let src = css.replace(/@import\s+(url\([^)]*\)|'[^']*'|"[^"]*")[^;]*;/g, '').replace(/\/\*\s*@kind other\s*\*\//g, '')
  src = namespace(src)
  const out = []
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    if (open < 0) break
    const head = src.slice(i, open).trim()
    // find the matching close
    let depth = 1
    let j = open + 1
    while (j < src.length && depth) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
      j++
    }
    const body = src.slice(open + 1, j - 1)
    const lead = head.replace(/\/\*[\s\S]*?\*\//g, '').trim()
    if (lead.startsWith('@media')) {
      out.push(`${lead}{${transform(body, {}).trim()}}`)
    } else if (lead.startsWith('@keyframes')) {
      out.push(`${lead}{${body}}`)
    } else if (lead) {
      const sels = lead.split(',').map(scopeSelector).filter(Boolean)
      if (sels.length) out.push(`${[...new Set(sels)].join(', ')}{${body.trim()}}`)
    }
    i = j
  }
  const text = out.join('\n')
  return layer ? `@layer ${layer} {\n${text}\n}` : text
}

function findCore(dir) {
  if (existsSync(join(dir, 'tokens/colors.css')) && existsSync(join(dir, 'tokens/themes.css'))) return dir
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('__MACOSX')) {
      const hit = findCore(join(dir, e.name))
      if (hit) return hit
    }
  }
  return null
}

function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('usage: pnpm design:install <export.zip | export folder>')
    process.exit(2)
  }
  const input = resolve(arg.replace(/^~(?=\/)/, homedir()))
  if (!existsSync(input)) {
    console.error(`not found: ${input}`)
    process.exit(2)
  }
  let dir = input
  if (input.endsWith('.zip')) {
    dir = mkdtempSync(join(tmpdir(), 'fq-design-'))
    execFileSync('unzip', ['-q', '-o', input, '-d', dir])
  }
  const core = findCore(dir)
  if (!core) {
    console.error('no tokens/colors.css + tokens/themes.css in that export; is it the Frequency design system?')
    process.exit(1)
  }

  // 1. vendor
  rmSync(VENDOR, { recursive: true, force: true })
  mkdirSync(VENDOR, { recursive: true })
  for (const part of ['tokens', 'guidelines', 'templates', 'ui_kits', 'design_handoff_element_library', 'styles.css', 'README.md', 'readme.md', 'HANDOFF.md', 'SKILL.md', 'assets/icons', 'assets/logo', 'assets/economy', 'assets/infographics']) {
    const from = join(core, part)
    if (existsSync(from)) cpSync(from, join(VENDOR, part), { recursive: true })
  }
  writeFileSync(
    join(VENDOR, 'INSTALLED.md'),
    `# Installed Frequency design system\n\n> Status lives in [docs/BUILD-BACKLOG.json](../../docs/BUILD-BACKLOG.json). This folder is the vendored export; do not edit it, re-run the installer.\n\n- Source: \`${basename(input)}\`\n- Installed: ${new Date().toISOString().slice(0, 10)}\n- Not vendored (too large for git): assets/photos, assets/broll, assets/facilities. Keep them with the export.\n- Generated from it: app/themes/frequency/core.css (namespaced to --fq-, scoped to [data-design="frequency"]).\n- Hand-kept beside it: app/themes/frequency.css (the alias layer), lib/theme/design-fonts/frequency.ts (faces).\n`,
  )

  // 2. generate
  const read = (f) => (existsSync(join(core, f)) ? readFileSync(join(core, f), 'utf8') : '')
  const tokens = ['tokens/typography.css', 'tokens/colors.css', 'tokens/themes.css', 'tokens/space-motion.css']
    .map((f) => `/* ── ${f} ── */\n${transform(read(f))}`)
    .join('\n\n')
  // Component sheets the export ships beside the core (feature blocks, infographics). Their classes
  // (.fe-*, .ig-*) only apply where a block uses them; scoped and namespaced like the rest.
  const components = ['tokens/features.css', 'tokens/infographics.css']
    .filter((f) => existsSync(join(core, f)))
    .map((f) => `/* ── ${f} ── */\n${transform(read(f), { layer: 'components' })}`)
    .join('\n\n')
  let base = transform(read('tokens/base.css'), { layer: 'base' })
  mkdirSync(OUT_DIR, { recursive: true })
  // Every relative asset the export's CSS points at (`../assets/…`, at any depth) is served from
  // public/brand/frequency/<same path>, and copied there below. An unresolvable url() fails the build.
  const assets = new Set()
  const fixUrls = (css) =>
    css.replace(/url\((['"]?)(?:\.\.\/)+assets\/([^'")]+)\1\)/g, (_m, _q, rel) => {
      assets.add(rel)
      return `url('/brand/frequency/${rel}')`
    })
  writeFileSync(
    OUT,
    fixUrls(`/* GENERATED by scripts/install-frequency-design.mjs from ${basename(input)} (ADR-1740). Do not edit:\n   re-run \`pnpm design:install <export>\`. Every property is --fq-*, every selector is scoped to\n   [data-design="frequency"], so this sheet is inert under DAWN. */\n\n${tokens}\n\n/* ── tokens/base.css ── */\n${base}\n\n${components}\n`),
  )

  // 3. brand assets
  mkdirSync(PUBLIC, { recursive: true })
  for (const f of ['assets/logo/frequency-wordmark.png', 'assets/logo/frequency-icon-round.png', 'assets/icons/frequency-icons.svg']) {
    if (existsSync(join(core, f))) cpSync(join(core, f), join(PUBLIC, basename(f)))
  }
  for (const rel of assets) {
    const from = join(core, 'assets', rel)
    if (!existsSync(from)) {
      console.error(`✗ the export's CSS reads assets/${rel}, which is not in the export`)
      process.exit(1)
    }
    mkdirSync(join(PUBLIC, rel, '..'), { recursive: true })
    cpSync(from, join(PUBLIC, rel))
  }

  const props = (readFileSync(OUT, 'utf8').match(/--fq-[\w-]+\s*:/g) ?? []).length
  console.log(`✓ Frequency design system installed from ${basename(input)}`)
  console.log(`  vendored → design_handoff/frequency/   generated → app/themes/frequency/core.css (${props} --fq- declarations)`)
  console.log(`  brand → public/brand/frequency/        switch it on: pnpm design:use frequency`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
