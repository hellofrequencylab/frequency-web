import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { EDITABLE_PAGES, listPages, type PageRow } from '@/lib/page-editor/data'
import { normalizeSplash, primarySplashLink } from '@/lib/qr/splash'
import { listSplashTemplates, type SplashTemplate } from './splash-templates'

// The Loom Studio Splash registry (docs/LOOM-PLATFORM.md §4, docs/PAGE-FRAMEWORK.md §10). Backs the
// GOVERNANCE half of the Splash lane: it LISTS the live splashes across the two splash surfaces so
// staff can see status / target / schedule at a glance, and hands each row a DEEP-LINK OUT to the
// real editor. It never renders or edits a block tree.
//
// 🔴 §10 BOUNDARY: splash micro-sites stay Puck (`public.pages` → /edit/<slug>); QR splashes stay the
// constrained QR form (/spaces/<slug>/settings/qr or the /admin/qr studio). This module reads those
// surfaces read-only and produces an `editHref` that leaves the Loom. It NEVER makes a splash a
// module route, renders <PageModules> on a public splash, or registers a splash as an App.
//
// GATE: the reads use the service-role admin client (which bypasses RLS), so every public read
// RE-CHECKS the staff gate here (fail-closed to [] for a non-staff / anonymous caller), independent
// of the page that mounts the lane. VOICE (CONTENT-VOICE §10): plain labels, no em/en dashes.

/** The two splash surfaces the lane governs. */
export type SplashSource = 'micro-site' | 'qr'

/** One live splash as the governance list shows it (identity + status/target/schedule + a deep-link
 *  OUT to the real editor). Presentational, serializable — safe to hand to the client lane. */
export interface LiveSplash {
  id: string
  source: SplashSource
  title: string
  /** A short lifecycle label: draft | published | coded | active | inactive. */
  status: string
  /** Where the splash points or lives (a path, a primary-CTA url, or a plain note). */
  target: string | null
  /** The schedule/last-touched ISO timestamp (published_at / updated_at / created_at), or null. */
  schedule: string | null
  /** DEEP-LINK OUT to the real editor for this splash (Puck micro-site editor, or the QR studio). */
  editHref: string
  /** A short label for the edit affordance. */
  editLabel: string
}

/** Re-check the staff gate (janitor web_role) for every service-role read. Non-throwing: returns
 *  false for an anonymous / non-staff caller so the reads fail-closed to []. */
async function isStaff(): Promise<boolean> {
  const caller = await getCallerProfile().catch(() => null)
  return !!caller && isJanitor(caller.webRole)
}

// ── (a) CATALOG — the seeded splash templates (code-backed, read-only) ────────────────────────────

/** The seeded splash templates the lane catalogs. Pure passthrough to the code catalog so the lane
 *  and the resolver read one source (docs/LOOM-PLATFORM.md §4). */
export function splashTemplates(): readonly SplashTemplate[] {
  return listSplashTemplates()
}

// ── (b) GOVERNANCE — the live splashes across both surfaces (DB-backed, staff-gated) ──────────────

/** MICRO-SITE splashes: the home + marketing primaries (lib/page-editor/data EDITABLE_PAGES). The
 *  home splash renders from code even with no DB row, so every primary is governed here; a row's
 *  status comes from `public.pages` when present, else 'coded' (the coded default is live). Each
 *  Edit deep-links OUT to the Puck editor at /edit/<slug>. FAIL-SAFE to a coded list on any error. */
async function listMicroSiteSplashes(): Promise<LiveSplash[]> {
  const pages: Record<string, PageRow> = await listPages().catch(() => ({}))
  return EDITABLE_PAGES.map((p) => {
    const row = pages[p.slug]
    const published = row?.status === 'published'
    return {
      id: `page:${p.slug}`,
      source: 'micro-site' as const,
      title: p.title,
      status: row ? row.status : 'coded',
      target: p.path,
      schedule: row?.published_at ?? row?.updated_at ?? null,
      editHref: `/edit/${p.slug}`,
      editLabel: published ? 'Open in the page editor' : 'Draft in the page editor',
    }
  })
}

// qr_codes.splash + space_id aren't in the generated DB types yet (ADR-246), so reach them through a
// bespoke untyped handle (the codebase pattern for not-yet-typed columns; see lib/qr/space-codes.ts).
type QrSplashRow = {
  id: string
  slug: string
  title: string | null
  active: boolean | null
  created_at: string
  space_id: string | null
  splash: unknown
}
type UntypedQrQuery = {
  select: (cols: string) => UntypedQrQuery
  not: (col: string, op: string, val: null) => UntypedQrQuery
  order: (col: string, opts: { ascending: boolean }) => Promise<{ data: QrSplashRow[] | null }>
}

/** Resolve space_id → slug for the QR edit deep-link (space codes edit at /spaces/<slug>/settings/qr;
 *  non-space codes fall back to the /admin/qr studio). Untyped read, FAIL-SAFE to an empty map. */
async function spaceSlugs(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (ids.length === 0) return map
  try {
    const q = createAdminClient().from('spaces') as unknown as {
      select: (cols: string) => {
        in: (col: string, vals: string[]) => Promise<{ data: { id: string; slug: string }[] | null }>
      }
    }
    const { data } = await q.select('id, slug').in('id', ids)
    for (const r of data ?? []) map.set(r.id, r.slug)
  } catch {
    // fail-safe: no slugs → the /admin/qr studio fallback below
  }
  return map
}

/** QR splashes: every qr_code carrying a non-null (and valid) splash. Target = the primary CTA url
 *  when the splash has one, else a plain 'Landing page' note. Edit deep-links OUT to the QR studio
 *  (the space QR form for a space code, else /admin/qr). FAIL-SAFE to [] on any error. */
async function listQrSplashes(): Promise<LiveSplash[]> {
  try {
    const q = createAdminClient().from('qr_codes') as unknown as UntypedQrQuery
    const { data } = await q
      .select('id, slug, title, active, created_at, space_id, splash')
      .not('splash', 'is', null)
      .order('created_at', { ascending: false })
    const rows = (data ?? []).filter((r) => normalizeSplash(r.splash) !== null)

    const slugs = await spaceSlugs([...new Set(rows.map((r) => r.space_id).filter((x): x is string => !!x))])

    return rows.map((r) => {
      const splash = normalizeSplash(r.splash)
      const cta = primarySplashLink(splash)
      const spaceSlug = r.space_id ? slugs.get(r.space_id) : undefined
      return {
        id: `qr:${r.id}`,
        source: 'qr' as const,
        title: r.title?.trim() || `Code /${r.slug}`,
        status: r.active === false ? 'inactive' : 'active',
        target: cta ? cta.url : 'Landing page',
        schedule: r.created_at ?? null,
        editHref: spaceSlug ? `/spaces/${spaceSlug}/settings/qr` : '/admin/qr',
        editLabel: 'Edit in the QR studio',
      }
    })
  } catch {
    return []
  }
}

/** ALL live splashes across both surfaces (micro-sites first, then QR), staff-gated. FAIL-SAFE to []
 *  for a non-staff / anonymous caller or any error, so a service-role read never leaks. */
export async function listLiveSplashes(): Promise<LiveSplash[]> {
  if (!(await isStaff())) return []
  const [micro, qr] = await Promise.all([listMicroSiteSplashes(), listQrSplashes()])
  return [...micro, ...qr]
}

// ── "Used in" — reuse the library_usages index for a where-referenced note ────────────────────────

/** One where-referenced usage row (public.library_usages): a surface a library asset appears on. */
export interface SplashUsage {
  context: string
  refId: string | null
  blockId: string | null
}

/** The library assets referenced on a given page/surface (context + ref_id), reusing the shared
 *  `library_usages` index (migration 20260920000000) so the lane can note where assets land on a
 *  splash. Staff-gated + FAIL-SAFE to []. `context` defaults to 'page' (the micro-site splash case). */
export async function listSplashUsages(refId: string, context = 'page'): Promise<SplashUsage[]> {
  if (!(await isStaff())) return []
  try {
    // library_usages isn't in the generated DB types yet (ADR-246), so reach it through a bespoke
    // untyped `from` handle (cast the client, not to SupabaseClient).
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => Promise<{
              data: { context: string; ref_id: string | null; block_id: string | null }[] | null
            }>
          }
        }
      }
    }
    const { data } = await admin
      .from('library_usages')
      .select('context, ref_id, block_id')
      .eq('context', context)
      .eq('ref_id', refId)
    return (data ?? []).map((r) => ({ context: r.context, refId: r.ref_id, blockId: r.block_id }))
  } catch {
    return []
  }
}
