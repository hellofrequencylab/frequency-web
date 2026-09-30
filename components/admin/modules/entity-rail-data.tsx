'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import {
  entityRailReadsFor,
  entityRailRoute,
  type EntityRailKind,
  type EntityRailReadKey,
} from '@/lib/admin/entity-rail-reads'
import { getEntityRailBundle, type EntityRailSlice } from './entity-rail-actions'

// ENTITY RAIL DATA (ADR-1685, LIVE-655) — the one-request provider behind the circle, event, hub,
// nexus and practice rails, the twin of the Space rail's space-rail-data.tsx (ADR-550).
//
// Every module on those rails used to call its own 'use server' getter from a mount effect. Next.js
// sends Server Actions one at a time per client, so those reads queued behind each other, and three
// modules on a circle rail made the same read. This provider asks for the reads the MOUNTED modules
// need in ONE request (entity-rail-actions.ts runs each once, in parallel) and hands each module its
// slice through `useEntityRailRead`.
//
// THE FETCH STARTS AT MOUNT, before the modules do. Every module body is a `next/dynamic` chunk, so
// the provider's own effect fires the bundle while those chunks are still downloading, and a module
// that lands later reads a request that is already in flight or already back.
//
// ONE MOUNT, ONE SNAPSHOT. The bundle serves the reads that start while this provider is mounted. A
// module's later reload (after its own write) calls its getter directly, as it always did. The rail
// body mounts this provider around its section list only, so clearing a search, which remounts every
// module, remounts the provider too and fetches fresh, as the self-fetching modules did.
//
// FAIL-SAFE ISOLATION. A module outside the provider, on another entity, whose read the provider did
// not ask for, or whose read failed, calls its own getter exactly as before. The bundle can only
// save a request; it can never be the reason a module shows less.

type Bundle = Record<string, EntityRailSlice> | null

interface EntityRailDataValue {
  kind: EntityRailKind
  key: string
  /** Fire the bundle once (idempotent) and return it with the reads it asked for. */
  ensure: () => { requested: ReadonlySet<string>; bundle: Promise<Bundle> }
}

const EntityRailDataContext = createContext<EntityRailDataValue | null>(null)

const NOTHING_REQUESTED = { requested: new Set<string>(), bundle: Promise.resolve(null) } as const

/** Provide one bundled fetch to every entity rail module beneath it. Off an entity route, or with no
 *  mounted module that reads anything, it provides null and every module self-fetches. */
export function EntityRailDataProvider({
  pathname,
  moduleIds,
  children,
}: {
  pathname: string
  /** The ids of the rail nodes mounted below (catalog ids plus `extra:<slot>:<n>`). */
  moduleIds: readonly string[]
  children: ReactNode
}) {
  const route = entityRailRoute(pathname)
  const kind = route?.kind ?? null
  const key = route?.key ?? null

  // The reads to ask for, read at the moment the fetch fires (not a memo dependency of the context),
  // so a section list that settles a render later does not re-create the context and re-run every
  // module effect. A layout effect writes it, which runs before ANY passive effect in the same commit,
  // so a module whose chunk was already cached still finds the list filled when its effect asks.
  const reads = useMemo(() => (kind ? entityRailReadsFor(kind, moduleIds) : []), [kind, moduleIds])
  const readsRef = useRef<string[]>(reads)
  useLayoutEffect(() => {
    readsRef.current = reads
  }, [reads])

  const value = useMemo<EntityRailDataValue | null>(() => {
    if (!kind || !key) return null
    let fired: { requested: ReadonlySet<string>; bundle: Promise<Bundle> } | null = null
    return {
      kind,
      key,
      ensure: () => {
        if (fired) return fired
        const reads = readsRef.current
        // Nothing mounted that reads yet (the section list has not settled): answer "not requested"
        // WITHOUT spending the one fetch, so the list that does settle still gets it.
        if (reads.length === 0) return NOTHING_REQUESTED
        fired = {
          requested: new Set(reads),
          bundle: getEntityRailBundle(kind, key, reads).catch((err: unknown) => {
            // The fail-safe fires here (every module falls back to its own getter), so say so.
            console.warn('[entity-rail] the bundled request failed; each module fetches for itself', err)
            return null
          }),
        }
        return fired
      },
    }
  }, [kind, key])

  // Fire as soon as the rail body mounts with something to read, in parallel with the module chunks.
  useEffect(() => {
    if (reads.length > 0) value?.ensure()
  }, [value, reads])

  return <EntityRailDataContext.Provider value={value}>{children}</EntityRailDataContext.Provider>
}

/** A module's first read, served from the rail bundle when the provider holds it, else from `getter`.
 *
 *  Returns a STABLE `(key) => Promise<T>` for the module's mount effect, a drop-in for the getter it
 *  used to call. `getter` must be the module-level server action the bundle's table maps `read` to
 *  (entity-rail-data.test.ts holds every call site to that). A reload after a write keeps calling
 *  the getter directly, so it is never served a snapshot. */
export function useEntityRailRead<K extends EntityRailKind, T>(
  kind: K,
  read: EntityRailReadKey<K>,
  getter: (key: string) => Promise<T>,
): (key: string) => Promise<T> {
  const ctx = useContext(EntityRailDataContext)
  return useCallback(
    (key: string) => {
      if (!ctx || ctx.kind !== kind || ctx.key !== key) return getter(key)
      const { requested, bundle } = ctx.ensure()
      if (!requested.has(read)) return getter(key)
      return bundle.then((b) => {
        const slice = b?.[read]
        // The bundle ran this exact getter with this exact key, so its data is this getter's result.
        return slice?.ok ? (slice.data as T) : getter(key)
      })
    },
    [ctx, kind, read, getter],
  )
}
