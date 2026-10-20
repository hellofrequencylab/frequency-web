# Frequency Experience

The Frequency app for Android: your Regulars stamp cards, reward codes and Zaps, check-in by tapping a
venue tag, and a remote for your CyberUnicorn 5000 over USB or Bluetooth. How it is built:
[`docs/MOBILE-APP.md`](../docs/MOBILE-APP.md).

It uses native modules (NFC, Bluetooth, USB serial), so it runs as a **development build**, not in Expo
Go.

## Run it on your computer

From `mobile/`:

```bash
pnpm install
```

```bash
cp .env.example .env
```

Fill in `.env`. Point `EXPO_PUBLIC_API_URL` at your laptop's LAN address while `pnpm dev` runs in the
repo root (for example `http://192.168.1.20:3000`), or at a preview deployment. Do not point a
development build at production by accident.

Checks:

```bash
pnpm check
```

That is `pnpm typecheck`, `pnpm lint` and `pnpm test` (the protocol and link parsers, under Node).

### Android emulator or a phone on a cable

Needs JDK 17, the Android SDK (`ANDROID_HOME`) and either a running emulator or a phone with USB
debugging on.

```bash
pnpm android
```

That runs `expo run:android`: it generates `android/`, builds a debug APK, installs it and starts Metro.
After the first build, `pnpm start` is enough while you only change JavaScript.

## Install on your Android phone (EAS development build)

1. Install the EAS CLI and sign in to your Expo account (your own login, in your terminal):

   ```bash
   npx eas-cli@latest login
   ```

2. Link the project once. It prints a project id: put it in `.env` as `EAS_PROJECT_ID`.

   ```bash
   npx eas-cli@latest init
   ```

3. Build the development APK in the cloud:

   ```bash
   pnpm build:apk
   ```

4. When it finishes, open the link EAS prints **on the phone** (or scan its QR code) and install the APK.
   Android asks you to allow installs from your browser: allow it for this install.
5. On your computer, run `pnpm start` and open the app on the phone. It finds Metro on the same Wi-Fi,
   or scan the QR code Metro shows.

### Or install over a USB cable with adb

1. On the phone: Settings, About phone, tap **Build number** seven times. Developer options appear.
2. Settings, System, Developer options: turn on **USB debugging**.
3. Plug the phone into the computer and tap **Allow** on the phone's prompt.
4. Check it is seen, then build and install:

   ```bash
   adb devices
   ```

   ```bash
   pnpm android
   ```

## Connect the CyberUnicorn 5000

**USB (OTG).** Use an OTG adapter that ends in **USB-A**, then a USB-A to USB-C cable to the CyberUnicorn.
A USB-C to USB-C cable will not power it (the board has no CC pull-downs). Android asks once to let
Frequency Experience use the device: tap OK (tick "always" to skip it next time). The app opens the
port without touching the reset lines, so the board keeps running. The phone powers the board and the
hat, so watch the phone's battery with the radios on.

**Bluetooth.** On the CyberUnicorn open **Remote**, then **Bluetooth now** (or run `remote ble on`).
In the app: Device, Connect, Bluetooth. It shows up as **CU5K**. Android asks for **Nearby devices**
the first time. Turn Bluetooth on the gadget off again when you are done; it is open to anyone in range.

Either way your phone stays on its own Wi-Fi.

**Internet.** Coming soon (it needs the device relay on the server).

## What needs the real hardware

The USB and Bluetooth links and every device screen can only be proved with the CyberUnicorn in hand.
Commands whose app is not in the firmware yet (LED, sound, sensors, the `frequency.*` tag commands)
answer "Not in this firmware yet" until their branches merge.
