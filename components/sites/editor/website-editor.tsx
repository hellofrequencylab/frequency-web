'use client'

import { useCallback } from 'react'
import { config } from '@/lib/page-editor/config'
import { saveWebsiteDraft, proposeWebsiteText, syncWebsitePresence } from '@/lib/sites/editor/actions'
import type { WebsiteSnapshot } from '@/lib/sites/editor/state'
import { WebsiteEditorShell, type WebsiteEditorShellProps } from './shell'

export function ConnectedWebsiteEditor(props: Omit<WebsiteEditorShellProps, 'onSave' | 'onPropose' | 'onPresence' | 'config'>) {
  const host = props.host
  const save = useCallback((revision: number, draft: WebsiteSnapshot, publish: boolean, scheduledAt?: string) => saveWebsiteDraft(host, revision, draft, publish, scheduledAt), [host])
  const propose = useCallback((request: string, value: string) => proposeWebsiteText(host, request, value), [host])
  const presence = useCallback((cursor: Parameters<typeof syncWebsitePresence>[1]) => syncWebsitePresence(host, cursor), [host])
  return <WebsiteEditorShell {...props} config={config} onSave={save} onPropose={propose} onPresence={presence} />
}
