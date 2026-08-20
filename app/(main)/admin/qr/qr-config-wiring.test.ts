import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// LIVE-066 — the qr-studio element config's CONSUMPTION chain, in the house source-shape archetype
// (components/events/series-wiring.test.ts, components/profile/profile-associations-wiring.test.ts).
//
// Why source text and not behaviour: resolveQrStudio() shipped as "plumbing only" and sat unconsumed
// for weeks — the /admin/elements screen wrote settings that changed NOTHING. The behavioural half
// (role gating, layer folding, the fail-safe) is already proven in lib/elements/qr-studio.test.ts;
// what nothing measured is that the resolved config actually REACHES StyleEditor. Deleting one link
// of the prop chain (the resolve at a mount, the qrConfig hand-down, the config= on a StyleEditor)
// is silent, ships green, and reverts the element settings to decoration. This file pins each link.

const pure = readFileSync('lib/elements/qr-studio-config.ts', 'utf8')
const resolver = readFileSync('lib/elements/qr-studio.ts', 'utf8')
const editor = readFileSync('app/(main)/admin/qr/style-editor.tsx', 'utf8')
const adminPage = readFileSync('app/(main)/admin/qr/page.tsx', 'utf8')
const dashboard = readFileSync('app/(main)/admin/qr/qr-studio-dashboard.tsx', 'utf8')
const codesPage = readFileSync('app/(main)/codes/page.tsx', 'utf8')
const linkActions = readFileSync('app/(main)/admin/qr/link-actions.ts', 'utf8')
const pageQrManager = readFileSync('components/qr/page-qr-manager.tsx', 'utf8')

// Count-based assertions run against comment-stripped copies so a deleted line cannot pass on the
// strength of the comment that explained it.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1

// Every surface that mounts a StyleEditor whose config is threaded (7 design surfaces + the page
// share popup). components/elements/previews.tsx is deliberately absent: it is the /admin/elements
// DEMO of the full editor on the screen that edits these very settings, so it shows everything.
const THREADED_SURFACES = [
  'app/(main)/admin/qr/qr-generator.tsx',
  'app/(main)/admin/qr/dynamic-links.tsx',
  'app/(main)/admin/qr/qr-studio.tsx',
  'app/(main)/admin/qr/member-profile-codes.tsx',
  'app/(main)/admin/qr/marketing-codes-admin.tsx',
  'app/(main)/codes/member-codes.tsx',
  'app/(main)/codes/marketing-codes.tsx',
  'components/qr/page-qr-manager.tsx',
]

describe('the split that lets a client editor type the config (guards a vacuous pass)', () => {
  it('the pure config module carries the fold and never the element store', () => {
    expect(pure).toContain('export function pickQrStudioConfig')
    expect(pure).toContain('export const DEFAULT_QR_STUDIO_CONFIG')
    // The whole point of the split: client-safe, so no IO import may creep in.
    expect(pure).not.toContain("./store")
    expect(pure).not.toContain('supabase')
  })

  it('the async resolver still folds through the pure module (one fold, not two)', () => {
    expect(resolver).toContain("pickQrStudioConfig(elementDef('qr-studio')")
    expect(resolver).toContain('readElementLayers')
  })
})

describe('StyleEditor consumes the config (the header-element precedent: off = not rendered)', () => {
  const code = strip(editor)

  it('takes the config prop, defaulting to the fail-safe full config', () => {
    expect(code).toContain("from '@/lib/elements/qr-studio-config'")
    expect(code).toContain('config = DEFAULT_QR_STUDIO_CONFIG')
  })

  it('gates every control group on its config toggle', () => {
    // Colors: the swatches on `colors`, the two editor-tier extras on their own toggles (still
    // AND-ed with !compact, which dropped them before the element config existed).
    expect(code).toContain('const showEyeColor = !compact && config.eyeColor')
    expect(code).toContain('const showGradient = !compact && config.gradient')
    expect(code).toContain('const showColorsGroup = config.colors || showEyeColor || showGradient')
    expect(code).toContain('{config.colors && (')
    // Shape / Logo / Frame: whole-group gates.
    expect(code).toContain('{config.shapes && (')
    expect(code).toContain('{config.logo && (')
    expect(code).toContain('{config.frame && (')
  })

  it("honors the presets choice ('core' trims to the four core looks)", () => {
    expect(code).toContain("compact || config.presets === 'core'")
  })
})

describe('the /admin/qr mount resolves once and threads to all five Studio surfaces', () => {
  it('resolves the element config server-side with the operator as the viewer', () => {
    expect(adminPage).toContain('resolveQrStudio({')
    expect(adminPage).toContain('communityRole: caller.role')
    expect(adminPage).toContain('qrConfig={qrConfig}')
  })

  it('the dashboard hands qrConfig to exactly the five design surfaces', () => {
    // QrGenerator + DynamicLinks + QrStudio + MemberProfileCodes + MarketingCodesAdmin. Fewer = a
    // surface fell off the chain; more = a new surface joined without this test learning about it.
    expect(occurrences(strip(dashboard), 'qrConfig={qrConfig}')).toBe(5)
  })
})

describe('the /codes mount resolves for the MEMBER (where the role gates actually bite)', () => {
  it('resolves with the caller profile and threads to both member surfaces', () => {
    expect(codesPage).toContain('resolveQrStudio({')
    // MemberCodes + CrewMarketing (which passes on to MarketingCodes).
    expect(occurrences(strip(codesPage), 'qrConfig={qrConfig}')).toBe(3)
  })
})

describe('the page share popup fetches its config through the server action (the Loom precedent)', () => {
  it('link-actions exposes getQrStudioConfig, resolving for the caller', () => {
    expect(linkActions).toContain('export async function getQrStudioConfig')
    expect(linkActions).toContain('resolveQrStudio({')
  })

  it('PageQrManager fetches it on mount and hands it to its StyleEditor', () => {
    expect(pageQrManager).toContain('getQrStudioConfig().then(setQrConfig)')
    expect(pageQrManager).toContain('config={qrConfig}')
  })
})

describe('every threaded StyleEditor mount carries the config prop', () => {
  for (const path of THREADED_SURFACES) {
    it(path, () => {
      const src = strip(readFileSync(path, 'utf8'))
      const mounts = src.split('<StyleEditor').slice(1)
      expect(mounts.length).toBeGreaterThanOrEqual(1)
      for (const mount of mounts) {
        // The JSX props run up to the tag close; each mount must pass config=.
        const props = mount.slice(0, mount.indexOf('/>'))
        expect(props, `a <StyleEditor> in ${path} does not pass config=`).toContain('config=')
      }
    })
  }
})
