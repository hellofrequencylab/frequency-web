'use client'

import { useCallback, useEffect, useLayoutEffect } from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import {
  EntityLayoutProvider,
  useProfileLayout,
  type SaveLayout,
} from '@/components/entity-blocks/profile-layout-context'
import type { UploadImage } from '@/components/entity-blocks/block-edit-panel'
import { saveSpaceGridLayout } from '@/app/(main)/spaces/[slug]/settings/profile/actions'
import { uploadSpaceBlockImage } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { SpaceCanvasEditor } from './space-canvas-editor'

// THE MOUNT for the on-canvas WYSIWYG Space editor (the space analogue of the email EditorPane). It mounts
// the SHARED entity-layout provider with kind 'space' and the SAME owner-gated save the rail arranger uses
// (saveSpaceGridLayout, owner-checked by slug server-side; the store owns the debounce + re-sanitize), seeds
// it with the persisted layout (rows + hidden + content + style) before first paint, then renders the
// two-pane canvas editor. Standalone: it does not depend on the profile-root shell provider, so it is
// additive + reversible (mounting / removing it changes nothing about how the layout persists). No em dashes.

/** Seed the shared store from the persisted layout the INSTANT the mount lands (a layout effect wins the
 *  store's first-seed race), so authored content + style are present before the canvas paints. Degrades to a
 *  plain effect on the server (effects never run there) to avoid the SSR warning. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function Seeder({
  rows,
  hidden,
  content,
  style,
}: {
  rows: RowDef[]
  hidden: string[]
  content: Record<string, Record<string, unknown>>
  style: Record<string, BlockStyle>
}) {
  const store = useProfileLayout()
  useIsoLayoutEffect(() => {
    if (!store || store.seeded) return
    store.seed(rows, hidden, content, style)
  }, [store, rows, hidden, content, style])
  return null
}

export function SpaceCanvasEditorMount({
  slug,
  rows,
  hidden = [],
  content = {},
  style = {},
}: {
  slug: string
  rows: RowDef[]
  hidden?: string[]
  content?: Record<string, Record<string, unknown>>
  style?: Record<string, BlockStyle>
}) {
  const save = useCallback<SaveLayout>((payload: BuilderLayout) => saveSpaceGridLayout(slug, payload), [slug])
  // The rail's image fields upload through the SAME owner-gated, service-role path as the space cover / logo.
  const uploadImage = useCallback<UploadImage>(
    (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return uploadSpaceBlockImage(slug, fd)
    },
    [slug],
  )
  return (
    <EntityLayoutProvider kind="space" save={save}>
      <Seeder rows={rows} hidden={hidden} content={content} style={style} />
      <SpaceCanvasEditor uploadImage={uploadImage} />
    </EntityLayoutProvider>
  )
}
