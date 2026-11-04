'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { LoomPickerActionsProvider } from '@/components/loom/picker-actions-context'
import { websiteLoomScopes, websiteLoomScope, websiteLoomImages, uploadWebsiteLoomImage } from '@/lib/sites/editor/media-actions'
import { SiteMenuActionsProvider } from '@/components/spaces/site-menu-actions'
import { loadWebsiteMenu, saveWebsiteMenu, resetWebsiteMenu, saveWebsiteHeaderLogo, uploadWebsiteLogo } from '@/lib/sites/editor/menu-actions'
import { WebsiteFeatureSourceContext } from './feature-source-context'
import type { WebsiteFeatures } from '@/lib/sites/editor/live-data'
import { config } from '@/lib/page-editor/config'
import { saveWebsiteDraft, saveWebsiteStyle, proposeWebsiteText, proposeWebsiteLayout, syncWebsitePresence, loadWebsiteFeatureSource } from '@/lib/sites/editor/actions'
import type { WebsiteSnapshot } from '@/lib/sites/editor/state'
import { WebsiteEditorShell, type WebsiteEditorShellProps } from './shell'

// THE NEW BUILDER (BLD-101): loaded only when asked for, so the current editor's page carries none of it.
const BuilderShell = dynamic(() => import('@/components/builder/shell/builder-shell').then((m) => m.BuilderShell), { ssr: false, loading: () => <div role="status">Loading the builder…</div> })

export function ConnectedWebsiteEditor({ builder, ...props }: Omit<WebsiteEditorShellProps, 'onSave' | 'onPropose' | 'onLayout' | 'onPresence' | 'onStyle' | 'config'> & { builder?: 'v3' }) {
  const host = props.host
  const [features, setFeatures] = useState<WebsiteFeatures>(() => (props.metadata?.websiteFeatures as WebsiteFeatures | undefined) ?? {})
  const [sourceError, setSourceError] = useState<string | null>(null)
  const sourceRequests = useRef(new Map<string, Promise<void>>())
  const loadSource = useCallback((blockId: string, source: string): Promise<void> => {
    const key = JSON.stringify([source, blockId])
    const existing = sourceRequests.current.get(key)
    if (existing) return existing
    const request = (async () => {
      const result = await loadWebsiteFeatureSource(host, source)
      if (result.ok) {
        setFeatures((previous) => ({ ...previous, [key]: result.items }))
        setSourceError(null)
      } else {
        sourceRequests.current.delete(key)
        setSourceError(result.error)
      }
    })()
    sourceRequests.current.set(key, request)
    return request
  }, [host])
  const sources = useMemo(() => ({ load: loadSource, error: sourceError }), [loadSource, sourceError])
  const save = useCallback((revision: number, draft: WebsiteSnapshot, publish: boolean, scheduledAt?: string | null) => saveWebsiteDraft(host, revision, draft, publish, scheduledAt), [host])
  const propose = useCallback((request: string, value: string) => proposeWebsiteText(host, request, value), [host])
  const layout = useCallback((request: string, outline: Parameters<typeof proposeWebsiteLayout>[2], styleMenu?: Parameters<typeof proposeWebsiteLayout>[3], facts?: Parameters<typeof proposeWebsiteLayout>[4]) => proposeWebsiteLayout(host, request, outline, styleMenu, facts), [host])
  const style = useCallback((patch: Parameters<NonNullable<WebsiteEditorShellProps['onStyle']>>[0]) => saveWebsiteStyle(host, patch), [host])
  const presence = useCallback((cursor: Parameters<typeof syncWebsitePresence>[1]) => syncWebsitePresence(host, cursor), [host])
  const media = useMemo(() => ({
    scopes: () => websiteLoomScopes(host),
    scope: (key: string) => websiteLoomScope(host, key),
    images: (key: string, options: Parameters<typeof websiteLoomImages>[2]) => websiteLoomImages(host, key, options),
    upload: (key: string, data: FormData) => uploadWebsiteLoomImage(host, key, data),
  }), [host])
  const menu = useMemo(() => ({
    load: () => loadWebsiteMenu(host),
    save: (value: Parameters<typeof saveWebsiteMenu>[1]) => saveWebsiteMenu(host, value),
    reset: () => resetWebsiteMenu(host),
    saveLogo: (logo: { mode: string; logoUrl: string | null }) => saveWebsiteHeaderLogo(host, logo),
    uploadLogo: (data: FormData) => uploadWebsiteLogo(host, data),
  }), [host])
  return <SiteMenuActionsProvider actions={menu}><LoomPickerActionsProvider actions={media}><WebsiteFeatureSourceContext.Provider value={sources}>{builder === 'v3' ? <BuilderShell {...props} metadata={{ ...props.metadata, websiteFeatures: features }} config={config} onSave={save} onStyle={style} /> : <WebsiteEditorShell {...props} metadata={{ ...props.metadata, websiteFeatures: features }} config={config} onSave={save} onPropose={propose} onLayout={layout} onPresence={presence} onStyle={style} />}</WebsiteFeatureSourceContext.Provider></LoomPickerActionsProvider></SiteMenuActionsProvider>
}
