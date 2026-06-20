import type { Metadata } from 'next'
import { IndexTemplate } from '@/components/templates/index-template'
import { PageModules } from '@/components/widgets/page-modules'

export const metadata: Metadata = {
  title: 'Programs',
  description: 'Free frameworks and trainings for starting, running, and growing a circle.',
}

// Programs — the Foundation's frameworks and trainings for starting, running, and growing a circle.
// The interior is module-driven (ADR-270/294): the open browse list self-fetches the Markdown
// library and the viewer's completion, and an operator can arrange it (Settings ▾ → Page → Layout).
// The page keeps only its Index header and renders <PageModules>.
export default async function ProgramsPage() {
  return (
    <IndexTemplate
      title="Programs"
      description="Free frameworks and trainings to help you start, run, and grow a real circle. None of it is appointed from above; this is how to do it yourself."
    >
      <PageModules route="/programs" />
    </IndexTemplate>
  )
}
