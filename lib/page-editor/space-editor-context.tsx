'use client'

import { createContext, useContext } from 'react'

// The seam that threads the ACTIVE SPACE slug from the space landing editor down to the Loom-backed
// image field (lib/page-editor/loom-image-field.tsx). Puck's custom-field `render` gets no editor
// metadata (only value/onChange/id), so a field can't learn which space it is editing from Puck. Both
// editor surfaces (the desktop <Puck> in space-landing-editor.tsx and the mobile ResponsiveEditor)
// wrap their tree in <SpaceEditorProvider slug={slug}>; the field reads the slug via useSpaceEditorSlug.
//
// SAFE BY DEFAULT: outside a space editor (e.g. the marketing editor, or the public <Render> which
// never invokes field `render`) the context default is null, and the Loom field degrades to a disabled
// "not available here" state. The slug is UNTRUSTED UX plumbing: every Loom action re-resolves the
// space from the slug and re-gates per-space edit permission server-side, so the context can never
// grant access it shouldn't.

const SpaceEditorContext = createContext<{ slug: string | null }>({ slug: null })

export function SpaceEditorProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <SpaceEditorContext.Provider value={{ slug }}>{children}</SpaceEditorContext.Provider>
}

/** The active space slug inside a space editor, or null outside one. */
export function useSpaceEditorSlug(): string | null {
  return useContext(SpaceEditorContext).slug
}
