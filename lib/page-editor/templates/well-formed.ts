import type { Data } from '@/lib/page-editor/types'

// PERF-031: the shape check lives in its own file with NO block config import, so a public page that
// only needs it does not pull the whole block library (every site kit) into its graph. templates/index.ts
// re-exports it unchanged.
//
// A document is WELL-FORMED if it has content and every entry names a type. It says
// NOTHING about whether those types are still known — that is the renderer's problem,
// not the loader's. Use this anywhere discarding the document would lose an author's
// work: <BlockRender> already skips an item it cannot resolve (block-render.tsx), so an
// unknown block costs one section, never the page.
export function isWellFormed(data: unknown): data is Data {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content) || content.length === 0) return false
  return content.every((b) => typeof b?.type === 'string')
}
