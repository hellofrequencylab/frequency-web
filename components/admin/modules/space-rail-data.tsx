'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getSpaceRailCore,
  getSpaceRailExtras,
  type SpaceRailCore,
  type SpaceRailExtras,
} from '@/app/(main)/spaces/[slug]/manage/rail-getters'

// SPACE RAIL DATA (ADR-550, two-phase) — the shared-fetch provider behind the standardized Space rail. Each
// Space module (Basics / Branding / Settings / Page + the page builder + the summary cards) used to self-fetch
// through its OWN 'use server' action on mount, and because a server action is a SEPARATE request React's
// per-request cache never deduped the heavy resolve (caller → visible space → manage access → caps → extras)
// across them: ~8 modules × the same resolve = the slow rail. A first pass folded them into ONE bundle, but
// that bundle awaited the SLOW half (the layout picker reads + the 6 summary counts) before ANY slice was
// ready — so the three EDITOR sections (Identity & Branding / Info & Connect / Your Page), which read only the
// cheap core slices, were blocked on 8 queries they never use.
//
// The fix: TWO phases fetched IN PARALLEL, each provided on its own:
//   • CORE   — basics / branding / settings / page / hero, off the shared resolve with no extra query. The
//              editor sections gate on this, so they open as fast as any other admin rail.
//   • EXTRAS — the layout picker seed (page builder) + the summary counts. Fills in when it lands; nothing
//              waits on it.
//
// FAIL-SAFE ISOLATION: a module mounted OUTSIDE the rail (no provider), or a phase that errored, falls back to
// its own getter exactly as before — so every module still works standalone. Each phase SELF-GATES identically
// to the individual getters (null for a non-manager), so a null phase simply means every slice is null.

type Status = 'loading' | 'ready' | 'error'

interface Phase<T> {
  status: Status
  /** The resolved data when ready; null while loading, on error, or when the viewer cannot manage. */
  data: T | null
}

interface SpaceRailDataValue {
  core: Phase<SpaceRailCore>
  extras: Phase<SpaceRailExtras>
}

const SpaceRailDataContext = createContext<SpaceRailDataValue | null>(null)

/** Fetch the Space rail's two phases ONCE for the given slug and provide them to every descendant module.
 *  With no slug (off a Space route) it provides null, so descendants behave exactly as if unwrapped
 *  (self-fetch). Keyed on the slug so a Space→Space navigation remounts the fetcher (fresh `loading`). */
export function SpaceRailDataProvider({
  slug,
  children,
}: {
  slug: string | null
  children: ReactNode
}) {
  if (!slug) {
    return <SpaceRailDataContext.Provider value={null}>{children}</SpaceRailDataContext.Provider>
  }
  return (
    <SpaceRailDataFetcher key={slug} slug={slug}>
      {children}
    </SpaceRailDataFetcher>
  )
}

function SpaceRailDataFetcher({ slug, children }: { slug: string; children: ReactNode }) {
  const [core, setCore] = useState<Phase<SpaceRailCore>>({ status: 'loading', data: null })
  const [extras, setExtras] = useState<Phase<SpaceRailExtras>>({ status: 'loading', data: null })

  useEffect(() => {
    let active = true
    // Both phases fire together; the editor sections gate on `core`, which carries no summary/picker query and
    // so resolves first. On error each phase falls through to per-module self-fetch (isolation).
    getSpaceRailCore(slug)
      .then((data) => {
        if (active) setCore({ status: 'ready', data })
      })
      .catch(() => {
        if (active) setCore({ status: 'error', data: null })
      })
    getSpaceRailExtras(slug)
      .then((data) => {
        if (active) setExtras({ status: 'ready', data })
      })
      .catch(() => {
        if (active) setExtras({ status: 'error', data: null })
      })
    return () => {
      active = false
    }
  }, [slug])

  return (
    <SpaceRailDataContext.Provider value={{ core, extras }}>{children}</SpaceRailDataContext.Provider>
  )
}

/** The raw provider value (null when a module is mounted outside the provider). */
export function useSpaceRailData(): SpaceRailDataValue | null {
  return useContext(SpaceRailDataContext)
}

/** The CORE phase (basics / branding / settings / page / hero), or null when unwrapped. */
export function useSpaceRailCore(): Phase<SpaceRailCore> | null {
  return useContext(SpaceRailDataContext)?.core ?? null
}

/** The EXTRAS phase (layout seed + summaries), or null when unwrapped. */
export function useSpaceRailExtras(): Phase<SpaceRailExtras> | null {
  return useContext(SpaceRailDataContext)?.extras ?? null
}

/** Read one slice from a provider phase, with a self-fetch fallback for isolation. Shared by the core-slice
 *  and summary hooks below so the two never drift.
 *
 *  • Inside the rail (phase present, not errored): while it loads → `{ loading: true }`; once ready → the
 *    selected slice (null when the phase data is null / the slice is gated null). No self-fetch.
 *  • Outside the rail, or when the phase errored → self-fetch through the module's own getter exactly as
 *    before. `fallback` MUST be a stable reference (a module-level server action).
 */
function usePhaseSlice<P, T>(
  phase: Phase<P> | null,
  slug: string | null,
  select: (data: P) => T | null,
  fallback: (slug: string) => Promise<T | null>,
): { data: T | null; loading: boolean } {
  const usingProvider = phase != null && phase.status !== 'error'

  const [self, setSelf] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: true })

  useEffect(() => {
    // Self-fetch ONLY when there is no usable phase (mounted outside the rail, or the phase errored).
    if (!slug || usingProvider) return
    let active = true
    fallback(slug).then((d) => {
      if (active) setSelf({ data: d, loading: false })
    })
    return () => {
      active = false
    }
  }, [slug, usingProvider, fallback])

  if (!slug) return { data: null, loading: false }
  if (usingProvider) {
    if (phase!.status === 'loading') return { data: null, loading: true }
    return { data: phase!.data ? select(phase!.data) : null, loading: false }
  }
  return self
}

/** Read ONE editor module's slice from the CORE phase, with a self-fetch fallback for isolation. */
export function useSpaceRailSlice<T>(
  slug: string | null,
  select: (core: SpaceRailCore) => T | null,
  fallback: (slug: string) => Promise<T | null>,
): { data: T | null; loading: boolean } {
  return usePhaseSlice(useSpaceRailCore(), slug, select, fallback)
}

/** Read ONE rail summary card's count from the EXTRAS phase (its `summaries[surfaceId]` slice), with the
 *  card's own getter as the isolation fallback. Inside the rail the count comes from the one extras fetch
 *  instead of a per-card 'use server' round-trip that re-ran the whole resolve chain; mounted outside the rail
 *  (or on an extras error) the card self-fetches exactly as before. `fallback` MUST be a stable reference. */
export function useSpaceRailSummary(
  slug: string | null,
  surfaceId: string,
  fallback: (slug: string) => Promise<{ count: number; tier?: string } | null>,
): { data: { count: number; tier?: string } | null; loading: boolean } {
  return usePhaseSlice(
    useSpaceRailExtras(),
    slug,
    (extras) => extras.summaries[surfaceId] ?? null,
    fallback,
  )
}
