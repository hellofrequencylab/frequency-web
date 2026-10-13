import Link from 'next/link'
import { MembersBody } from '@/components/frequency/members/shared/members-body'

// Mindless with nothing on the member's list yet, under Frequency: the DAWN empty state's own copy in
// the members kit (the reference has no empty screen, so its head and a soft card carry it).
export function MindlessEmpty() {
  return (
    <MembersBody>
      <div className="head">
        <div>
          <span className="k">The Quest · Mindless</span>
          <h1 className="h1">
            Tune <span className="serif">out.</span>
          </h1>
          <span className="meta">The world can wait a few minutes. Breathe, log, collect the day.</span>
        </div>
      </div>
      <div className="soft stack mc-start">
        <span className="h3">Nothing on your list yet.</span>
        <span className="t2">Adopt a practice first; then this is where you do it.</span>
        <Link className="btn pa" href="/practices">
          Browse practices
        </Link>
      </div>
    </MembersBody>
  )
}
