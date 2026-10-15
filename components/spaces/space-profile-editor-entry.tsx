'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { openAdminBar, type OpenAdminBarModuleMenu } from '@/components/admin/open-admin-bar'
import type { SpaceType } from '@/lib/spaces/types'

/** Mounted only by the server-authorized owner preview. The query selects an
 * existing editor, never its scope or permissions; those come from the server. */
export function SpaceProfileEditorEntry({ slug, spaceId, spaceType, moduleMenu }: {
  slug: string
  spaceId: string
  spaceType: SpaceType
  moduleMenu?: OpenAdminBarModuleMenu
}) {
  const pathname = usePathname()
  const edit = useSearchParams().get('edit')
  useEffect(() => {
    if (edit !== 'page' || (pathname !== `/spaces/${slug}` && pathname !== `/spaces/${slug}/full`)) return
    // The shell's listener installs in the same effect pass. Dispatch after that
    // pass, including on a first page load rather than only client navigation.
    const timer = window.setTimeout(() => openAdminBar({ scope: { kind: 'space', id: spaceId }, spaceType, moduleMenu, appId: 'space.layout' }), 0)
    return () => window.clearTimeout(timer)
  }, [edit, pathname, slug, spaceId, spaceType, moduleMenu])
  return null
}
