import { StepScreen } from '@/components/launch/step-screen'
import { DashboardTemplate } from '@/components/templates'
import { loadStepScreen } from '@/lib/launch/step-screen-io'

// /launch/step/get-paid (SCAN-1211): this step's own screen. It says what the step is for and opens the real tool. Read under
// the person's own session. Dark while LAUNCH_SYSTEM_ENABLED is off.
export default async function LaunchStepPaidPage() {
  const data = await loadStepScreen('paid')
  return (
    <DashboardTemplate eyebrow={data.eyebrow} title={data.title} description={data.description} adminBar={false} width="default">
      <StepScreen data={data} />
    </DashboardTemplate>
  )
}
