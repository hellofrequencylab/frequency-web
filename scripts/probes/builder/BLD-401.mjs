// BLD-401: presence is live in the real editor shells. The provider's peer book (lib/editor-crdt/provider.ts,
// `presence` option) reaches the UI: the session forwards it and tells the room this tab's selection; the Space
// builder's live mount (EditorCollab) feeds faces in its header and selection outlines over its nodes; the
// canvas route does the same; the v3 builder top bar reads faces from a live session. Presence never writes the
// doc, the presence UI imports no CRDT runtime, and the Yjs import stays in the allowlisted editor-only chunks.
import fs from 'node:fs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
const RUNTIME = /(?:from\s*|import\(\s*)['"](?:yjs|y-[a-z-]+)['"]/

const session = read('lib/editor-crdt/session.ts')
if (!/connectEditor\(\{[^)]*\bpresence\b/.test(session)) bad.push('the session must hand `presence` to the provider')
if (!/select\(nid\)\s*\{[^}]*link\.select\(nid\)/.test(session)) bad.push('the session must tell the room this tab\'s selection')

const aw = read('lib/editor-crdt/awareness.ts')
if (RUNTIME.test(aw) || /\.get(Map|Array|Text|XmlFragment)\(/.test(aw)) bad.push('awareness must not touch a Y.Doc')
if (!/export function presenceSelf\(/.test(aw)) bad.push('presenceSelf (who this tab is) is missing')

const collab = read('components/entity-blocks/editor-collab.tsx')
if (!/presence:\s*self\s*\?/.test(collab) || !/onPeers/.test(collab)) bad.push('EditorCollab must open its session with presence and report peers')
if (!/session\.current\?\.select\(selectedNid\)/.test(collab)) bad.push('EditorCollab must follow the store selection')
if (RUNTIME.test(collab)) bad.push('EditorCollab must load the CRDT runtime only through a dynamic lib/editor-crdt import')

const builder = read('components/entity-blocks/node-page-builder.tsx')
if (!/<EditorCollab[^>]*onPeers=\{setPeers\}/.test(builder)) bad.push('the Space builder must hear the peers of its live session')
if (!/<PresenceFaces peers=\{peers\} \/>/.test(builder)) bad.push('the Space builder header must show faces')
if (!/<PresenceOutlines root=\{canvasRef\} peers=\{peers\} \/>/.test(builder) || !/data-presence-nid=/.test(builder)) bad.push('the Space builder must outline peer selections on its nodes')
// The Space builder sits on the Space page: the presence UI must be its own chunk, never a static import (BLD-101).
if (/from ['"]@\/components\/builder\//.test(builder) || !/import\('@\/components\/builder\/presence\/presence-live'\)/.test(builder)) bad.push('the Space builder must load presence dynamically')

const canvas = read('components/builder/canvas/collab-canvas.tsx')
if (!/connectEditor\(\{[\s\S]*?presence:\s*self\s*\?/.test(canvas) || !/<EditorPresenceFaces peers=\{peers\} \/>/.test(canvas)) bad.push('the canvas must join with presence and show faces')
if (!/onFocus=\{\(\) => select\.current\(CANVAS_NID\)\}/.test(canvas) || !/selectedNid === CANVAS_NID/.test(canvas)) bad.push('the canvas must share and outline node selections')

const shell = read('components/builder/shell/builder-shell.tsx')
if (!/<LivePresenceFaces \/>/.test(shell)) bad.push('the builder top bar must show faces from a live session')

for (const f of ['components/builder/presence/presence-ui.tsx', 'components/builder/presence/presence-live.tsx']) {
  const src = read(f)
  if (RUNTIME.test(src) || /from\s*['"]@\/lib\/editor-crdt\/(?!awareness['"])/.test(src) || /^import\s+(?!type)[^\n]*editor-crdt/m.test(src)) bad.push(`${f} must not import the CRDT runtime (types only)`)
}

const allow = read('scripts/editor-crdt-importers.txt')
for (const f of ['components/entity-blocks/editor-collab.tsx', 'components/builder/canvas/collab-canvas.tsx']) if (!allow.includes(f)) bad.push(`${f} must stay on the editor-only allowlist`)
if (/components\/builder\/presence\//.test(allow)) bad.push('the presence UI must not need the CRDT allowlist')

if (!/session presence/.test(read('lib/editor-crdt/session.test.ts'))) bad.push('the session presence test is missing')
if (!/without a live session/.test(read('components/builder/presence/presence-live.test.tsx'))) bad.push('the flag-off presence test is missing')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('BLD-401: presence wired into the Space builder, the canvas and the builder top bar')
