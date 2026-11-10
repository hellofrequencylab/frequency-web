// RICH TEXT ON THE SHARED DOC — E4. A block's rich text is a Y.XmlFragment kept in its own root map
// (`text`), keyed `<nid>/<field>`, so the layout tree (node-ydoc.ts) stays plain data and a text edit
// never rebuilds a row. y-prosemirror (via Tiptap's Collaboration extension) binds the fragment to an
// editor. This file is only the addressing and the seed; it imports no editor code.
// Editor only: no visitor bundle may import it (check:editor-crdt-importers).

import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror'
import type { Schema } from '@tiptap/pm/model'

const TEXT_ROOT = 'text'
const SEP = '/'

/** The fragment for one block field, created empty on first use. nid and field must not contain `/`. */
export function textFragment(doc: Y.Doc, nid: string, field: string): Y.XmlFragment | null {
  if (!nid || !field || nid.includes(SEP) || field.includes(SEP)) return null
  const bag = doc.getMap<Y.XmlFragment>(TEXT_ROOT)
  let frag = bag.get(`${nid}${SEP}${field}`)
  if (!(frag instanceof Y.XmlFragment)) {
    frag = new Y.XmlFragment()
    bag.set(`${nid}${SEP}${field}`, frag)
  }
  return frag
}

/** Seed an EMPTY fragment from ProseMirror JSON. A fragment that already has content is left alone,
 *  so a late joiner never doubles a peer's text. Returns whether it wrote. */
export function seedTextFragment(frag: Y.XmlFragment, schema: Schema, json: Record<string, unknown>): boolean {
  if (frag.length > 0) return false
  prosemirrorJSONToYXmlFragment(schema, json, frag)
  return true
}

/** The fragment read back as ProseMirror JSON (for the snapshot boundary and for tests). */
export function readTextFragment(frag: Y.XmlFragment): Record<string, unknown> {
  return yXmlFragmentToProsemirrorJSON(frag) as Record<string, unknown>
}
