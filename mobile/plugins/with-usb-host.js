// Config plugin: Android USB host for the CyberUnicorn 5000 (CH340, VID 0x1A86).
//  - declares android.hardware.usb.host and android.hardware.nfc as optional features;
//  - adds a USB_DEVICE_ATTACHED intent filter + device filter, so plugging the gadget in offers to
//    open Frequency Experience (and "always open" grants USB permission without a prompt).
const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins')

const FILTER_NAME = 'usb_device_filter'
const FILTER_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- WCH CH340 / CH341 (the CYD's USB-UART). Written by plugins/with-usb-host.js. -->
<resources>
  <usb-device vendor-id="6790" />
</resources>
`

function withFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest
    manifest['uses-feature'] = manifest['uses-feature'] || []
    for (const name of ['android.hardware.usb.host', 'android.hardware.nfc', 'android.hardware.bluetooth_le']) {
      if (!manifest['uses-feature'].some((f) => f.$['android:name'] === name)) {
        manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } })
      }
    }
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults)
    activity['intent-filter'] = activity['intent-filter'] || []
    const action = 'android.hardware.usb.action.USB_DEVICE_ATTACHED'
    if (!activity['intent-filter'].some((f) => (f.action || []).some((a) => a.$['android:name'] === action))) {
      activity['intent-filter'].push({ action: [{ $: { 'android:name': action } }] })
    }
    activity['meta-data'] = activity['meta-data'] || []
    if (!activity['meta-data'].some((m) => m.$['android:name'] === action)) {
      activity['meta-data'].push({ $: { 'android:name': action, 'android:resource': `@xml/${FILTER_NAME}` } })
    }
    return cfg
  })
}

function withFilterResource(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${FILTER_NAME}.xml`), FILTER_XML)
      return cfg
    },
  ])
}

module.exports = function withUsbHost(config) {
  return withFilterResource(withFeatures(config))
}
