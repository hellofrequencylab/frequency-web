import { Eye } from 'lucide-react'
import { readViewAsTarget, isEntityTarget } from '@/lib/view-as'
import { ExitSpacePreviewButton } from '@/components/spaces/exit-space-preview-button'

// STAFF PREVIEW BANNER (entity-spaces, owner back-end). Shown at the top of an owner surface when a
// platform staffer (a janitor / Executive Admin) is VIEWING a Space they do not manage. It makes the
// read-only mode unmistakable: the forms on the surface are disabled, and every write action is
// gated on canEditProfile server-side, so a staff viewer can read the owner back-end but never write
// through it. Copy passes CONTENT-VOICE: plain, no narrated feelings, no em/en dashes.
//
// When the staffer arrived through previewAsSpace (the entity view-as cookie is set), the banner
// also carries the way OUT — the exit control that clears the cookie via exitSpacePreview. The
// banner itself renders on the janitor axis alone (staffViewing), so the exit only shows when
// there is actually a preview cookie to clear.

export async function StaffPreviewBanner({ spaceName }: { spaceName: string }) {
  const previewing = isEntityTarget(await readViewAsTarget())

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-card border border-warning/30 bg-warning-bg px-4 py-3"
    >
      <Eye className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1 text-body-sm">
        <p className="font-semibold text-text">Staff preview</p>
        <p className="mt-0.5 text-muted">
          You are viewing {spaceName}&rsquo;s owner settings as platform staff. Changes are disabled
          here.
        </p>
      </div>
      {previewing && <ExitSpacePreviewButton />}
    </div>
  )
}
