import Link from 'next/link'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { MemberHead } from '@/components/frequency/members/shared/member-head'
import { GetMovingButton } from './get-moving-button'

// Mindless with nothing on the member's list yet, under Frequency: the DAWN empty state's own copy in
// the members kit (the reference has no empty screen, so its head and a soft card carry it). Be Still
// needs a practice to log against; Get Moving does not (a free movement session), so it is offered here
// too rather than leaving the member with only a detour.
export function MindlessEmpty() {
  return (
    <MembersBody>
      <MemberHead
        kicker="Mindless"
        title={
          <>
            Tune <span className="serif">out.</span>
          </>
        }
        meta="The world can wait a few minutes. Breathe, log, collect the day."
      />
      <div className="soft stack mc-start">
        <span className="h3">Nothing on your list yet.</span>
        <span className="t2">Adopt a practice first; then this is where you do it. Or skip the list and get moving now.</span>
        <span className="row wrap mc-gap-8">
          <Link className="btn pa" href="/practices">
            Browse practices
          </Link>
          <GetMovingButton />
        </span>
      </div>
    </MembersBody>
  )
}
