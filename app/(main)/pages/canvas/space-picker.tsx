// PICK THE SPACE PAGE THE CANVAS OPENS (PROG-E5B). A plain GET form: it puts the Space's address or id in the
// `space` search param and the route does the rest (the read is authorised there, never here). No script needed.

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'

export function CanvasSpacePicker({ space, page, opened }: { space?: string; page?: string | null; opened: boolean }) {
  return (
    <form action="/pages/canvas" method="get" aria-label="Open a Space page" className="mb-4 flex flex-wrap items-end gap-2">
      {page ? <input type="hidden" name="page" value={page} /> : null}
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor="canvas-space" className="mu-label">Space page to edit</label>
        <Input id="canvas-space" name="space" defaultValue={space ?? ''} placeholder="The Space address, like calm-studio" className="min-h-11" autoComplete="off" />
      </div>
      <Button type="submit" variant="secondary" className="min-h-11">Open</Button>
      {space && !opened ? (
        <p role="status" className="w-full text-meta text-muted">No page opened for that Space: it was not found, it has no page yet, or you cannot view it. The demo block is shown.</p>
      ) : null}
    </form>
  )
}
