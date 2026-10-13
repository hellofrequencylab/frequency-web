import { Suspense } from 'react'
import { componentFor } from '@/lib/widgets/registry'

// A named run of page modules, rendered in place. The Frequency bodies place each module where its
// reference template puts that content (an event's activity under About, its Host credit in the side
// column) instead of handing the whole interior to <PageModules>' operator grid, whose two-column
// frame would sit inside the kit's own `.ap-cols`. Each module still reads the request-scoped context
// its page stamped (setEventContext / setCircleContext), so its data, gates and actions are exactly
// the ones the DAWN page renders. A module that has nothing to show renders null, as it always has.
export function FqModules({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id) => {
        const Component = componentFor(id)
        if (!Component) return null
        return (
          <Suspense key={id} fallback={null}>
            <Component />
          </Suspense>
        )
      })}
    </>
  )
}
