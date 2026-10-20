import { PageHeading, Screen } from '@/components/screen'
import { Meta } from '@/ui'

// The CyberUnicorn 5000 dashboard lands here with the device layer (docs/MOBILE-APP.md §1). This
// layer only proves the shell: fonts, theme, the canvas and its wash, the tab bar.

export default function DeviceHome() {
  return (
    <Screen>
      <PageHeading eyebrow="Your gadget" title="CyberUnicorn 5000" description="Plug it in with a USB OTG adapter, or connect over Bluetooth. Your phone stays on its own Wi-Fi." />
      <Meta>The remote arrives with the next layer of this app.</Meta>
    </Screen>
  )
}
