import { permanentRedirect } from 'next/navigation'

// /demo was merged into /how-it-works (product tour + "a day in Frequency"
// timeline now live there). This route is retired with a permanent (308) redirect.
export default function DemoRedirect() {
  permanentRedirect('/how-it-works')
}
