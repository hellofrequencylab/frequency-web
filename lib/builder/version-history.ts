import type { WebsiteEditorState } from '@/lib/sites/editor/state'

export type EditorVersionSummary = Readonly<Pick<WebsiteEditorState['versions'][number], 'id' | 'createdAt' | 'author'>>

/** The scrubber moves from oldest to newest. Duplicate or unreadable entries get no preview stop. */
export function versionTimeline(versions: readonly EditorVersionSummary[]): EditorVersionSummary[] {
  const seen = new Set<string>()
  const dated = []
  for (const { id, createdAt, author } of versions) {
    const time = Date.parse(createdAt)
    if (!id.trim() || !Number.isFinite(time) || seen.has(id)) continue
    seen.add(id)
    dated.push({ time, version: { id, createdAt, author } })
  }
  return dated.sort((a, b) => a.time - b.time).map(({ version }) => version)
}

export function selectedVersionIndex(timeline: readonly EditorVersionSummary[], selectedId: string | null): number {
  const selected = timeline.findIndex(({ id }) => id === selectedId)
  return selected >= 0 ? selected : timeline.length - 1
}
