'use client'

// INLINE RICH TEXT ON THE SHARED DOC (PROG-E4). One block field is a Tiptap editor bound to the Y.XmlFragment at
// `<nid>/<field>` in the shared doc (lib/editor-crdt/text-binding.ts), so two browsers editing the same field
// converge. Tiptap's own history is off: y-prosemirror's undo plugin owns undo so it only reverts YOUR edits.
// The caller owns the doc, the provider and where this mounts (inside the canvas shell). Editor only: it is on the
// check:editor-crdt-importers allowlist, and no visitor bundle reaches it.

import { useEffect } from 'react'
import type * as Y from 'yjs'
import { EditorContent, Extension, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ySyncPlugin, yUndoPlugin } from 'y-prosemirror'
import { seedTextFragment, textFragment } from '@/lib/editor-crdt/text-binding'

export function CollabTextEditor({
  doc, nid, field, seed, label, className,
}: {
  doc: Y.Doc
  nid: string
  field: string
  /** ProseMirror JSON to seed an EMPTY fragment with (a late joiner never doubles a peer's text). */
  seed?: Record<string, unknown>
  label: string
  className?: string
}) {
  const fragment = textFragment(doc, nid, field)

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Extension.create({
          name: 'sharedDoc',
          addProseMirrorPlugins() {
            return fragment ? [ySyncPlugin(fragment), yUndoPlugin()] : []
          },
        }),
      ],
      editorProps: { attributes: { 'aria-label': label, role: 'textbox', 'aria-multiline': 'true', class: className ?? '' } },
    },
    [fragment],
  )

  useEffect(() => {
    if (editor && fragment && seed) seedTextFragment(fragment, editor.schema, seed)
  }, [editor, fragment, seed])

  if (!fragment) return null
  return <EditorContent editor={editor} />
}
