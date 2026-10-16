import { MembersBody } from '@/components/frequency/members/shared/members-body'

// Mindless while the member's list and remembered setup load, under Frequency: the door's own head and
// breathing orb hold the screen (app/(main)/on-air/loading.tsx), so the page does not flash the DAWN
// skeleton before the door appears in the same place.
export function MindlessLoading() {
  return (
    <MembersBody className="mc-door">
      <div className="stack mc-gap-12 mc-center">
        <span className="k">Mindless</span>
        <span className="h1">
          Tune <span className="serif">out.</span>
        </span>
      </div>
      <div className="mc-orb-wrap" aria-hidden>
        <span className="fq-breathe mc-orb-glow" />
        <span className="fq-breathe mc-orb-core" />
      </div>
      <span className="t2" role="status">
        Settling in
      </span>
    </MembersBody>
  )
}
