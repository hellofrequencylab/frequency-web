// A BASELINE IS ONLY VALID AGAINST THE ENVIRONMENT THAT PHOTOGRAPHED IT (LIVE-213).
//
// ── THE DEFECT, measured ──────────────────────────────────────────────────────────────────────
// Two fixed elements render in ONE Vercel environment and not the other:
//   1. the support-chat widget (components/chat/support-chat-widget.tsx) mounts only where
//      SUPPORT_CHAT=1, which is set for Production and not for Preview;
//   2. the Vercel preview toolbar is injected into every PREVIEW response and never into a
//      production one (ADR-1277; playwright.config.ts sends `x-vercel-skip-toolbar` so the camera
//      does not see it, which is the fix for that half).
// On 2026-09-08 a production-sourced capture was compared against a preview and 128 of 144
// surfaces went red, by about 2,500 px on every public page and ~900 px on the member shell:
// numbers that read exactly like a product regression and were argued about for a day.
//
// ── WHY THIS IS A STAMP AND NOT MORE MASKING ──────────────────────────────────────────────────
// A mask paints an opaque box, so it hides whatever ELSE moves inside that box; it is the remedy
// of last resort here, and the support widget already carries one. The divergence it cannot
// answer is the one this file is for: the two captures are of two different deployments, and no
// selector list makes them the same deployment.
//
// ── WHY NOT SIMPLY MAKE THE TWO AGREE ─────────────────────────────────────────────────────────
// That is the better fix and it is NOT code. `supportChatFlagEnabled()` is read by three
// PRERENDERED server layouts (app/(marketing), app/(help), app/discover), so on Vercel the value
// is evaluated at BUILD time; its own note in lib/comms/chat-token.ts says so. Turning it into a
// request-scoped read would force dynamic rendering on three public root layouts, which is the
// root-layout fan-out AGENTS.md says to fix rather than to add, in service of a test concern.
// Parity is therefore one owner value (SUPPORT_CHAT=1 for the Preview environment). Until it is
// set, the camera refuses a cross-environment comparison INSTEAD of printing one as a regression.
//
// ── WHAT THIS FILE DOES ───────────────────────────────────────────────────────────────────────
// The committed baseline folder carries a stamp naming the environment it was photographed on.
// `visual.spec.ts` reads it before the shutter and throws, once, with the environments named:
//   · on a COMPARE run, so a stale-environment red is diagnosed instead of being attributed to
//     the pull request that happened to trip it;
//   · on a CAPTURE run, so a dispatch pointed at a different environment cannot leave HALF the
//     folder photographed on production and half on a preview. `capture_shell` off is exactly
//     that shape: it rewrites the public PNGs and leaves the shell ones where they were.
// The deliberate way to move the whole set to another environment is to delete the stamp, which
// is one visible line in a diff and cannot happen by accident.
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Where a baseline was photographed. `unknown` never gates: see `captureEnvironmentMismatch`. */
export type CaptureEnvironment = 'production' | 'preview' | 'local' | 'unknown'

/** The stamp, beside the PNGs it describes. `e2e-manual.yml` commits the whole
 *  `test/e2e/__screenshots__/` folder, so the stamp rides along with the capture that wrote it
 *  and needs no second `git add`. */
export const CAPTURE_STAMP_PATH = 'test/e2e/__screenshots__/captured-on.json'

/** The production hostnames. Production is served from the apex domain, and every production
 *  dispatch this repo has recorded used `https://frequencylocal.com` (LIVE-213's own closing
 *  recipe names it). A `*.vercel.app` host is a per-deployment or per-branch preview URL. */
const PRODUCTION_HOSTS = new Set(['frequencylocal.com', 'www.frequencylocal.com'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])

export type CaptureStamp = {
  /** The environment class the baselines were photographed on. */
  readonly environment: CaptureEnvironment
  /** The exact base URL, so the stamp says WHICH preview as well as "a preview". */
  readonly baseUrl: string
}

/**
 * Which environment a base URL points at. Pure, total, and never throws: an unparseable or
 * unrecognised URL is `unknown`, and `unknown` is the one answer that does not gate, because a
 * guess about an environment is worse than no claim about it.
 */
export function classifyCaptureEnvironment(baseUrl: string | undefined | null): CaptureEnvironment {
  const raw = (baseUrl ?? '').trim()
  if (!raw) return 'unknown'
  let host: string
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    return 'unknown'
  }
  if (!host) return 'unknown'
  if (LOCAL_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.localhost')) return 'local'
  if (PRODUCTION_HOSTS.has(host)) return 'production'
  if (host === 'vercel.app' || host.endsWith('.vercel.app')) return 'preview'
  return 'unknown'
}

/** How the stamp is spelled on disk. One shape, so a hand-seeded stamp and a runner-written one
 *  are byte-identical and a capture does not churn the file for nothing. */
export function serializeCaptureStamp(stamp: CaptureStamp): string {
  return `${JSON.stringify({ environment: stamp.environment, baseUrl: stamp.baseUrl }, null, 2)}\n`
}

/** The stamp beside the committed baselines, or null when there is none. Never throws: a
 *  corrupt or half-written stamp reads as absent, which fails open to "no claim" rather than
 *  failing the run on a parse error. */
export function readCaptureStamp(root = process.cwd()): CaptureStamp | null {
  const file = join(root, CAPTURE_STAMP_PATH)
  if (!existsSync(file)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const { environment, baseUrl } = parsed as Partial<CaptureStamp>
    if (environment !== 'production' && environment !== 'preview' && environment !== 'local') {
      return null
    }
    return { environment, baseUrl: typeof baseUrl === 'string' ? baseUrl : '' }
  } catch {
    return null
  }
}

/**
 * Write the stamp. Four capture workers run in parallel and all four write the SAME bytes, so
 * the write is atomic (temp file + rename) and the content carries no timestamp: a per-worker
 * clock would make the file differ from itself and put a spurious line in every capture commit.
 */
export function writeCaptureStamp(stamp: CaptureStamp, root = process.cwd()): void {
  const file = join(root, CAPTURE_STAMP_PATH)
  mkdirSync(dirname(file), { recursive: true })
  const body = serializeCaptureStamp(stamp)
  if (existsSync(file) && readFileSync(file, 'utf8') === body) return
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, body)
  try {
    renameSync(tmp, file)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      /* the rename is what matters; a stranded temp file is not worth a second failure */
    }
    throw error
  }
}

/** Whether Playwright is being asked to WRITE baselines on this run rather than compare them.
 *  `missing` is the default and writes only files that do not exist yet; it is a compare run for
 *  this purpose, and the gate runs before the shutter so a missing file is never written into a
 *  folder stamped for another environment. */
export function isCaptureRun(updateSnapshots: string | undefined): boolean {
  return updateSnapshots === 'all' || updateSnapshots === 'changed'
}

/**
 * The diagnosis, or null when there is nothing to say.
 *
 * It gates only when BOTH sides are known. `unknown` on either side means the suite cannot tell
 * which deployment it is looking at, and a gate that fires on a guess is the red-that-means-
 * nothing this repo has already paid for twice (ADR-970).
 */
export function captureEnvironmentMismatch(
  stamp: CaptureStamp | null,
  baseUrl: string | undefined | null,
  { capturing = false }: { capturing?: boolean } = {},
): string | null {
  if (!stamp) return null
  const current = classifyCaptureEnvironment(baseUrl)
  if (current === 'unknown' || stamp.environment === 'unknown') return null
  if (current === stamp.environment) return null
  const where = stamp.baseUrl ? ` (${stamp.baseUrl})` : ''
  const head =
    `The committed visual baselines were photographed on ${stamp.environment.toUpperCase()}${where}, `
    + `and this run points at ${String(baseUrl)}, which is ${current.toUpperCase()}.`
  const why =
    'Those two deployments do not render the same chrome: the support-chat widget mounts only where '
    + 'SUPPORT_CHAT=1, which is Production and not Preview (LIVE-213). A comparison across them is red '
    + 'by thousands of pixels on every page whatever the change under test does.'
  const fix = capturing
    ? `Nothing was captured. A capture into a folder stamped ${stamp.environment} would leave half of it `
      + `photographed on ${stamp.environment} and half on ${current}. Re-dispatch with a base_url on `
      + `${stamp.environment}, or delete ${CAPTURE_STAMP_PATH} in a commit of its own to move the WHOLE `
      + 'set deliberately.'
    : `Nothing here is this change's fault. Compare against a ${stamp.environment} deployment, or `
      + `recapture the whole set from ${current} (e2e-manual.yml, update_baselines) so the stamp and the `
      + 'PNGs agree.'
  return `${head} ${why} ${fix}`
}
