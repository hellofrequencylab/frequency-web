'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

// Page-level "Edit Mode" for the inline tuning layer (ADR-138). State lives in the
// URL (`?edit=1`) so it's shareable, survives refresh, and needs no app-shell
// context — both the Edit button and every inline editor read it from here. We also
// honour the legacy `?edit=true` links already sprinkled in the app.
const EDIT_VALUES = new Set(['1', 'true'])

export function useEditMode() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const editing = EDIT_VALUES.has(sp.get('edit') ?? '')

  const setEditing = useCallback(
    (on: boolean) => {
      const params = new URLSearchParams(sp.toString())
      if (on) params.set('edit', '1')
      else params.delete('edit')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [sp, router, pathname],
  )

  const toggle = useCallback(() => setEditing(!editing), [setEditing, editing])

  return { editing, setEditing, toggle }
}
