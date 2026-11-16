import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { StepScreenData } from '@/lib/launch/step-screen-io'

// A LAUNCH STEP SCREEN (SCAN-1211): the body of the seven steps that open a tool. What this step is for, one button into the real
// tool, and the way back to the launch. The route wraps it in the Dashboard template. Server-friendly, no hooks.
export function StepScreen({ data }: { data: StepScreenData }) {
  return (
    <section className="panel" aria-label={data.title} style={{ display: 'grid', gap: 16 }}>
      {data.done ? <p className="t2">This step is done. You can still open it to change anything.</p> : null}
      {data.needsSpace ? <p className="t2">Your Space comes first. We will start with your Spotlight, then bring you back here.</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Button asChild>
          <Link href={data.href}>{data.needsSpace ? 'Start with my Spotlight' : data.action}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/launch">Back to my launch</Link>
        </Button>
      </div>
    </section>
  )
}
