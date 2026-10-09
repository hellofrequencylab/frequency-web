'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { LoomPickerActionsProvider } from '@/components/loom/picker-actions-context'
import { websiteLoomScopes, websiteLoomScope, websiteLoomImages, uploadWebsiteLoomImage } from '@/lib/sites/editor/media-actions'
import { WebsiteFeatureSourceContext } from './feature-source-context'
import type { WebsiteFeatures } from '@/lib/sites/editor/live-data'
import { config } from '@/lib/page-editor/config'
import { saveWebsiteDraft, proposeWebsiteText, syncWebsitePresence, loadWebsiteFeatureSource } from '@/lib/sites/editor/actions'
import type { WebsiteSnapshot } from '@/lib/sites/editor/state'
import { WebsiteEditorShell, type WebsiteEditorShellProps } from './shell'

export function ConnectedWebsiteEditor(props: Omit<WebsiteEditorShellProps, 'onSave' | 'onPropose' | 'onPresence' | 'config'>) {
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
  const presence = useCallback((cursor: Parameters<typeof syncWebsitePresence>[1]) => syncWebsitePresence(host, cursor), [host])
  const media = useMemo(() => ({
    scopes: () => websiteLoomScopes(host),
    scope: (key: string) => websiteLoomScope(host, key),
    images: (key: string, options: Parameters<typeof websiteLoomImages>[2]) => websiteLoomImages(host, key, options),
    upload: (key: string, data: FormData) => uploadWebsiteLoomImage(host, key, data),
  }), [host])
  return <LoomPickerActionsProvider actions={media}><WebsiteFeatureSourceContext.Provider value={sources}><WebsiteEditorShell {...props} metadata={{ ...props.metadata, websiteFeatures: features }} config={config} onSave={save} onPropose={propose} onPresence={presence} /></WebsiteFeatureSourceContext.Provider></LoomPickerActionsProvider>
}
