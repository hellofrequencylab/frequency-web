'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getSpaceRailBundle,
  type SpaceRailBundle,
} from '@/app/(main)/spaces/[slug]/manage/rail-getters'

// SPACE RAIL DATA (ADR-550) — the one-fetch provider behind the standardized Space rail. Each Space module
// (Basics / Branding / Settings / Page + the page builder) used to self-fetch through its OWN 'use server'
// action on mount, and because a server action is a SEPARATE request React's per-request cache never
// deduped the heavy resolve (caller → visible space → manage access → caps → extras) across them: ~5
// modules × the same resolve = the slow rail. This provider calls getSpaceRailBundle(slug) ONCE on a Space
// root, holds the result in context, and each module reads its slice via the shared hook below.
//
// FAIL-SAFE ISOLATION: a module mounted OUTSIDE the rail (no provider), or one whose bundle errored, falls
// back to its own getter exactly as before — so every module still works standalone and nothing breaks. The
// bundle itself SELF-GATES identically to the individual getters (null for a non-manager), so a null bundle
// simply means every slice is null, which is what each getter would have returned.

type Status = 'loading' | 'ready' | 'error'

interface SpaceRailDataValue {
  status: Status
  /** The resolved bundle when ready; null while loading, on error, or when the viewer cannot manage. */
  bundle: SpaceRailBundle | null
}

const SpaceRailDataContext = createContext<SpaceRailDataValue | null>(null)

/** Fetch the Space rail bundle ONCE for the given slug and provide it to every descendant module. With no
 *  slug (off a Space route) it provides null, so descendants behave exactly as if unwrapped (self-fetch).
 *  Keyed on the slug so a Space→Space navigation remounts the fetcher (fresh `loading`) with no in-effect
 *  reset. */
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
  const [value, setValue] = useState<SpaceRailDataValue>({ status: 'loading', bundle: null })

  useEffect(() => {
    let active = true
    getSpaceRailBundle(slug)
      .then((bundle) => {
        if (active) setValue({ status: 'ready', bundle })
      })
      .catch(() => {
        // On error, fall through to per-module self-fetch (isolation): the modules read `error` and
        // recover with their own getter, so a bundle failure never blanks the whole rail.
        if (active) setValue({ status: 'error', bundle: null })
      })
    return () => {
      active = false
    }
  }, [slug])

  return <SpaceRailDataContext.Provider value={value}>{children}</SpaceRailDataContext.Provider>
}

/** The raw provider value (null when a module is mounted outside the provider). */
export function useSpaceRailData(): SpaceRailDataValue | null {
  return useContext(SpaceRailDataContext)
}

/** Read ONE module's slice from the shared bundle, with a self-fetch fallback for isolation.
 *
 *  • Inside the rail (provider present, not errored): while the bundle loads → `{ loading: true }`; once
 *    ready → the selected slice (null when the bundle is null / the slice is gated null). No self-fetch.
 *  • Outside the rail, or when the bundle errored → the module self-fetches through its own getter exactly
 *    as before. `fallback` MUST be a stable reference (a module-level server action).
 */
export function useSpaceRailSlice<T>(
  slug: string | null,
  select: (bundle: SpaceRailBundle) => T | null,
  fallback: (slug: string) => Promise<T | null>,
): { data: T | null; loading: boolean } {
  const ctx = useSpaceRailData()
  const usingProvider = ctx != null && ctx.status !== 'error'

  const [self, setSelf] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: true })

  useEffect(() => {
    // Self-fetch ONLY when there is no usable provider (mounted outside the rail, or the bundle errored).
    // No synchronous reset in the effect body — `self` starts at loading, matching the original modules'
    // per-mount behavior; the async result is the only setState here.
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
    if (ctx!.status === 'loading') return { data: null, loading: true }
    return { data: ctx!.bundle ? select(ctx!.bundle) : null, loading: false }
  }
  return self
}

/** Read ONE rail summary card's count from the shared bundle (its `summaries[surfaceId]` slice), with the
 *  card's own getter as the isolation fallback. This is what stops the summary-card fan-out: inside the rail
 *  the count comes from the one bundle fetch instead of a per-card 'use server' round-trip that re-ran the
 *  whole resolve chain; mounted outside the rail (or on a bundle error) the card self-fetches exactly as
 *  before. `fallback` MUST be a stable reference (a module-level server action, e.g. getSpaceMembersSummary). */
export function useSpaceRailSummary(
  slug: string | null,
  surfaceId: string,
  fallback: (slug: string) => Promise<{ count: number; tier?: string } | null>,
): { data: { count: number; tier?: string } | null; loading: boolean } {
  return useSpaceRailSlice(slug, (bundle) => bundle.summaries[surfaceId] ?? null, fallback)
}
