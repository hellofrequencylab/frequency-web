'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { ActionResult } from '@/lib/action-result'
import type { MenuEditorData } from '@/lib/spaces/site-menu-core'
import type { SiteMenu } from '@/lib/spaces/site-menu'
import {
  getSiteMenuEditorData,
  resetSiteMenu,
  saveHeaderLogo,
  saveSiteMenu,
} from '@/app/(main)/spaces/[slug]/manage/layout/menu-actions'
import { uploadSpaceImage } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// WHERE THE MENU EDITOR TALKS TO (SCAN-832). SiteMenuEditor is mounted in the Space console, which authorizes by
// the Frequency session, and in the website editor, which runs on the site's own host where that cookie never
// arrives and authorizes by the site-admin pass. The editor reads its five server calls from this context; with
// no provider it uses the Space console's, keyed by slug.

interface SiteMenuActions {
  load: () => Promise<MenuEditorData | null>
  save: (menu: SiteMenu) => Promise<ActionResult>
  reset: () => Promise<ActionResult>
  saveLogo: (logo: { mode: string; logoUrl: string | null }) => Promise<ActionResult>
  uploadLogo: (formData: FormData) => Promise<{ url: string } | { error: string }>
}

const SiteMenuActionsContext = createContext<SiteMenuActions | null>(null)

export function SiteMenuActionsProvider({ actions, children }: { actions: SiteMenuActions; children: ReactNode }) {
  return <SiteMenuActionsContext.Provider value={actions}>{children}</SiteMenuActionsContext.Provider>
}

export function useSiteMenuActions(slug: string): SiteMenuActions {
  const provided = useContext(SiteMenuActionsContext)
  return useMemo(
    () =>
      provided ?? {
        load: () => getSiteMenuEditorData(slug),
        save: (menu) => saveSiteMenu(slug, menu),
        reset: () => resetSiteMenu(slug),
        saveLogo: (logo) => saveHeaderLogo(slug, logo),
        uploadLogo: (formData) => uploadSpaceImage(slug, 'logo', formData),
      },
    [provided, slug],
  )
}
