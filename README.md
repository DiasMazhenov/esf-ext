# ESF Bio Auth

Chrome MV3 extension for ESF certificate authentication and document signing.
On macOS, system biometrics unlock the local certificate PIN through a Swift
Native Messaging host. ESF still receives the official certificate-based
signature; biometrics are only a local approval gate.

## What Is Included

- `extension/` - unpacked Chrome extension.
- `native-host/` - Swift Native Messaging host and macOS Keychain integration.
- `sdk-bridge/` - Java/Kalkan bridge with vendored ESF SDK runtime JARs.
- `build-macos.sh` - builds a distributable macOS package.
- `macos/install.sh` - installs the host and runtime into a stable directory.

The downloaded `esf-sdk-2025` directory is not required at runtime. The
required SDK JARs are already in `sdk-bridge/lib`.

## Requirements

- macOS with Chrome.
- OpenJDK 21. Install with `brew install openjdk@21`, or set `ESF_JAVA_HOME`.
- An ESF `.p12` certificate and its PIN.
- A Mac with Touch ID or another supported macOS biometric method.

The current extension ID is fixed by the manifest key:
`bjokedaeolojcgaaanfhpofelnfgkebk`.

## Build A macOS Package

From the repository root:

```bash
./build-macos.sh
```

The output is created under `dist/`:

```text
dist/ESF-Bio-Auth-macOS-v0.1.53.zip
```

The build includes the extension, native host, compiled Java bridge, and all
vendored SDK JARs. By default the Swift host is built for the current Mac
architecture and the architecture is included in the package name. On an
Apple Silicon Mac this produces:

```bash
dist/ESF-Bio-Auth-macOS-arm64-v0.1.55.zip
```

To request a universal arm64/x86_64 host, use `MACOS_UNIVERSAL=1`. This
requires a macOS SDK that can cross-compile both architectures:

```bash
MACOS_UNIVERSAL=1 ./build-macos.sh
```

## Install On macOS

Unzip the package, then run:

```bash
./install-macos.sh
```

The installer copies runtime files to:

```text
~/Library/Application Support/ESF Bio Auth/
```

It also registers the Native Messaging host for Chrome. In `chrome://extensions`:

1. Enable **Developer mode**.
2. Click **Load unpacked**.
3. Select `~/Library/Application Support/ESF Bio Auth/extension`.
4. Reload the extension and the ESF tab.

If Chrome shows a Native Messaging error, verify that the loaded extension ID
is `bjokedaeolojcgaaanfhpofelnfgkebk` and that the registered host manifest
points to the installed `native-host/bin/esf-touchid-native-host`.

## Configure And Use

1. Open the extension popup.
2. Enter the IIN and select the `.p12` certificate.
3. Enter the certificate PIN and save. The PIN is stored in macOS Keychain,
   not in Chrome storage.
4. Open ESF and click **Войти через биометрию**.
5. For an invoice or AWP, use **Подписать через биометрию** in the ESF signing
   dialog.

The ESF page flow remains the official flow. The extension supplies the local
certificate signature after biometric confirmation.

## Development Checks

```bash
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json')); console.log('manifest ok')"
node --check extension/popup.js
node --check extension/service-worker.js
node --check extension/page-network-debug.js
./sdk-bridge/check-java.sh
./sdk-bridge/build.sh
./native-host/build.sh
node native-host/test-ping.js
```

Do not commit `.p12`, PINs, Keychain exports, debug traces, or generated
runtime output. The debug trace is temporary and may contain document data.

## Current Limitations

- Chrome still requires loading the unpacked extension manually. A Chrome Web
  Store package is a separate distribution step.
- Java 21 is a target-machine prerequisite; the JDK is not bundled in the zip.
- The main login/signing path uses the native SDK bridge. NCALayer code remains
  only as a debug fallback.
