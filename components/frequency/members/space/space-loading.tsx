import '@/app/themes/active/kit-members'
import '@/app/themes/active/space-page'
import '@/app/themes/active/members-events'

// THE SPACE PAGE'S WAIT, UNDER FREQUENCY (SCAN-856): the cover card, the identity on it, the tab row and a
// body column, the shape FqSpaceChrome paints, so the page lands without a jump. DAWN's skeleton draws its
// own cover-and-avatar header, a different shape. A member profile wears the same cover-card grammar
// (templates/members/Profile.html), so app/(main)/people/[handle]/loading.tsx uses it too. The bars are the kit's skeleton bars (members-events.css).

export function FqSpaceLoading({ label = 'Loading Space' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <section className="ph fqs-hero tall fqm-sk">
        <div className="fqs-hero-in">
          <div className="fqs-id">
            <div className="stack">
              <span className="ev-skel-bar tall w60" />
              <span className="ev-skel-bar w45" />
            </div>
          </div>
        </div>
      </section>
      <div className="stack sec">
        <span className="ev-skel-bar w60" />
        <span className="ev-skel-bar w45" />
        <span className="ev-skel-bar w30" />
      </div>
    </div>
  )
}
