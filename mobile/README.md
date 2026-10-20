# Frequency Experience

The Frequency app for Android. Two tabs: **Device** is a remote for your CyberUnicorn 5000, over a USB
cable or Bluetooth, and works with no Frequency account and no internet. **Frequency** is your account:
sign in with your email, see your stamp cards, reward codes, Zaps and streak, and check in by holding
your phone to a venue tag. How it is built: [`docs/MOBILE-APP.md`](../docs/MOBILE-APP.md).

## Install it on your phone (no cable, no developer options)

1. Get `frequency-experience.apk` onto the phone: email it to yourself, put it in Google Drive, or use
   any file share, then tap it in the Files app or the download notification.
2. Android asks to allow installs from that app (Files, Drive, Gmail or Chrome). Turn on **Allow from
   this source** for this one install, then go back and tap **Install**.
3. If Play Protect warns that it does not recognise the developer, tap **More details**, then **Install
   anyway**. The APK is signed with a development key, not a Play Store key, so this warning is
   expected.
4. Open **Frequency Experience**.

To update, install the new APK the same way: it replaces the old one and keeps nothing you need.

## Connect the CyberUnicorn 5000

**USB (OTG).** Use an OTG adapter that ends in **USB-A**, then a USB-A to USB-C cable to the CyberUnicorn.
A USB-C to USB-C cable will not power it (the board has no CC pull-downs). Android asks once to let
Frequency Experience use the device: tap OK, and tick "always" to skip it next time. With "always" on,
plugging the gadget in offers to open the app. The app opens the port without touching the reset lines
(DTR and RTS stay low), so the board keeps running. The phone powers the board and the hat, so watch the
phone's battery with the radios on.

**Bluetooth.** On the CyberUnicorn open **Remote**, then **Bluetooth now** (or run `remote ble on`). In
the app: Connect, Bluetooth. It shows up as **CU5K**. Android asks for **Nearby devices** the first time.
Turn the gadget's Bluetooth off when you are done: it is open to anyone in range.

Either way your phone stays on its own Wi-Fi.

**Internet.** Coming soon (it needs the device relay on the Frequency server first).

## What you can do

| Screen | What it does | Device command |
|---|---|---|
| Device (home) | Connection, status, memory, Wi-Fi and Bluetooth, the hat module | `system.status`, `hat.probe` |
| Light Show | Play and stop, scenes, brightness | `lightshow.state`, `lightshow.set` |
| LED colour | Colour wheel and modes | `led.set`, `led.mode` |
| Sound | Notes and chimes | `sound.tone` |
| Sensors | Light level and any sensors, live | `light.read`, `sensors.read` |
| Screen remote | Previous, next, select, back on the gadget's own screen | `screen.nav`, `apps.list` |
| Tag writer | Write a Frequency check-in link to an NFC tag and read it back. Signed in, pick one of your Spaces; otherwise paste the link | `frequency.write_tag`, `frequency.read_tag` |
| Console | Run any Bruce command, or watch the serial stream | `cli.run` |

## Your Frequency account

The Frequency tab. Sign in with the email on your Frequency account: type the code from the email, or
tap its link on the phone. New to Frequency? Make your account on the web first.

| What | How |
|---|---|
| Zaps, streak and reward codes | The three tiles at the top, the same counts as Rewards on the web |
| Stamp cards | Every Regulars card you hold, with any reward code waiting at the counter |
| Check in | Tap **Check in**, then **Ready to tap**, and hold the back of the phone on the Frequency tag at the door. No NFC on your phone? Scan the door QR with your camera, or paste the link |
| Notifications | Allowed once, when you first sign in; off until the build has its push keys |

A build without its Frequency settings (`mobile/.env`, see below) is the remote only; the Frequency tab
says so.

A command whose app is not in the firmware yet answers "Not in this firmware yet." That is expected
until its branch is merged.

## For developers

From `mobile/`:

```bash
pnpm install
```

Copy `.env.example` to `.env` and fill in the API address and the Supabase project (all public values).
Without it the Frequency tab is switched off and the remote still works.

```bash
pnpm check
```

That runs the typecheck, lint and tests (the protocol, byte and link parsers, under Node).

### Build the APK

Needs JDK 17 and the Android SDK (`ANDROID_HOME`). The first build downloads Gradle and its
dependencies and takes a while.

```bash
pnpm prebuild
```

```bash
pnpm build:apk:local
```

The APK lands in `android/app/build/outputs/apk/release/app-release.apk`. It is a release build with the
JavaScript inside, signed with the development key, so it installs and runs on its own without a dev
server.

### Run in the emulator or on a phone with a cable

With an emulator running or a phone with USB debugging on:

```bash
pnpm android
```

That builds a debug app, installs it and starts Metro. After that, `pnpm start` is enough while you only
change JavaScript.

### Cloud build (optional)

`pnpm build:apk` runs an EAS development build in the cloud. It needs your own Expo account
(`npx eas-cli@latest login`, then `npx eas-cli@latest init`).
