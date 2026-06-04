# ESF Touch ID Auth Extension Context

## Communication
- Отвечай коротко и по делу.
- Проектные файлы находятся в `/Users/diasmazhenov/vibecode/esf-ext`.
- GitHub repo: `https://github.com/DiasMazhenov/esf-ext` (private).
- Цель: Chrome extension + macOS native helper для удобного входа в ИС ЭСФ через официальную ЭЦП, где Touch ID только локально разрешает использование ключа/PIN.
- После каждого завершённого обновления делать commit и push в GitHub.
- После каждого изменения поднимать номер версии в формате display `0.1.02`; в Chrome manifest использовать `version_name`, потому что `version: "0.1.02"` невалиден из-за leading zero.

## Important Constraint
Touch ID не заменяет ЭЦП юридически или технически. ESF API остаётся certificate-based. Touch ID используется как локальный gate перед доступом к Keychain/`.p12`/подписи.

## SDK Location
Downloaded SDK:

```text
/Users/diasmazhenov/Downloads/esf-sdk-2025
```

Key docs:

```text
/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/Документация по сессиям.docx
/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/api-wsdl/SessionService.wsdl
```

## Auth Flow Found In SDK
Preferred flow:

1. `AuthService.createAuthTicket`
   - endpoint test stand: `https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/AuthService`
   - input: `iin`, optional `ttlInMinutes`
   - TTL: min `1`, max `1440`, default `30`
   - output: `authTicketXml`

2. Sign `authTicketXml` as XML Dsig using NCA/ESF SDK and local `.p12`.

3. `SessionService.createSessionSigned`
   - endpoint test stand: `https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/SessionService`
   - required: `tin`, `signedAuthTicket`
   - output: `sessionId`

4. Check session through `SessionService.currentSessionStatus`.
   - statuses observed in docs: `OK`, `CLOSED`, `NOT_FOUND`

5. Close session through `SessionService.closeSession`.

Details are in:

```text
/Users/diasmazhenov/vibecode/esf-ext/docs/auth-flow.md
```

## Files Created

```text
/Users/diasmazhenov/vibecode/esf-ext/.gitignore
/Users/diasmazhenov/vibecode/esf-ext/esf-touchid-auth-plan.md
/Users/diasmazhenov/vibecode/esf-ext/docs/auth-flow.md
/Users/diasmazhenov/vibecode/esf-ext/extension/manifest.json
/Users/diasmazhenov/vibecode/esf-ext/extension/popup.html
/Users/diasmazhenov/vibecode/esf-ext/extension/popup.css
/Users/diasmazhenov/vibecode/esf-ext/extension/popup.js
/Users/diasmazhenov/vibecode/esf-ext/extension/service-worker.js
/Users/diasmazhenov/vibecode/esf-ext/extension/content.js
/Users/diasmazhenov/vibecode/esf-ext/extension/content.css
/Users/diasmazhenov/vibecode/esf-ext/extension/open-dev-chrome.sh
/Users/diasmazhenov/vibecode/esf-ext/native-host/Sources/main.swift
/Users/diasmazhenov/vibecode/esf-ext/native-host/build.sh
/Users/diasmazhenov/vibecode/esf-ext/native-host/install-host.sh
/Users/diasmazhenov/vibecode/esf-ext/native-host/test-ping.js
/Users/diasmazhenov/vibecode/esf-ext/native-host/test-command.js
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/README.md
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/src/SignXml.java
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/build.sh
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/check-java.sh
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/test-sign.sh
```

Generated build outputs:

```text
/Users/diasmazhenov/vibecode/esf-ext/native-host/bin/esf-touchid-native-host
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/bin/sign-xml
```

## Verified

### Chrome Extension Static Checks

```bash
node -e "JSON.parse(require('fs').readFileSync('/Users/diasmazhenov/vibecode/esf-ext/extension/manifest.json','utf8')); console.log('manifest ok')"
node --check /Users/diasmazhenov/vibecode/esf-ext/extension/popup.js
node --check /Users/diasmazhenov/vibecode/esf-ext/extension/service-worker.js
```

Result: manifest and JS syntax OK.

### Chrome Extension ID / Native Host Registration
`extension/manifest.json` now has a stable dev `key`, so the unpacked extension ID is fixed:

```text
bjokedaeolojcgaaanfhpofelnfgkebk
```

Registered native host:

```bash
/Users/diasmazhenov/vibecode/esf-ext/native-host/install-host.sh bjokedaeolojcgaaanfhpofelnfgkebk
```

Result:

```text
/Users/diasmazhenov/Library/Application Support/Google/Chrome/NativeMessagingHosts/kz.esf.touchid.json
```

Verified allowed origin:

```text
chrome-extension://bjokedaeolojcgaaanfhpofelnfgkebk/
```

Chrome was launched with a temporary profile and the unpacked extension:

```bash
/Users/diasmazhenov/vibecode/esf-ext/extension/open-dev-chrome.sh
```

Important: this extension will not appear in the user's normal Chrome profile unless it is loaded there manually through `chrome://extensions` -> Developer mode -> Load unpacked -> `/Users/diasmazhenov/vibecode/esf-ext/extension`. For development, use the script above and check the separate temporary Chrome profile.

### Native Host Build

```bash
/Users/diasmazhenov/vibecode/esf-ext/native-host/build.sh
```

Result: built Swift binary.

### Native Messaging Protocol Test

```bash
node /Users/diasmazhenov/vibecode/esf-ext/native-host/test-ping.js
```

Result:

```json
{
  "ok": true,
  "message": "pong",
  "command": "ping"
}
```

### Touch ID Gate
Native host has command `touchIdCheck` using Swift `LocalAuthentication` with policy `.deviceOwnerAuthenticationWithBiometrics`.

Chrome popup login was manually verified by the user: it showed `Touch ID подтвержден`.

### Keychain Config
Native host now supports:

```text
saveConfig
configStatus
unlockPin
chooseCertificate
signXml
```

Popup has fields for:

```text
iin
certificatePath
pin
```

Rules:
- `pin` is sent directly to native host and stored in macOS Keychain as a generic password.
- Chrome does not store `pin`.
- `.p12` path can be selected through popup button `Выбрать`, which calls native host command `chooseCertificate`.
- `chooseCertificate` uses `/usr/bin/osascript` with `choose file` because `NSOpenPanel` did not visibly open when launched from Chrome Native Messaging.
- config file stores only `iin`, derived `tin`, `certificatePath`, `updatedAt`.
- For individual users, `tin` is derived from `iin`; the popup does not ask for BIN separately.
- config file location: `~/Library/Application Support/kz.esf.touchid/config.json`.
- Keychain service/account: `kz.esf.touchid` / `certificate-pin`.

Verified:

```bash
/Users/diasmazhenov/vibecode/esf-ext/native-host/build.sh
node /Users/diasmazhenov/vibecode/esf-ext/native-host/test-ping.js
node /Users/diasmazhenov/vibecode/esf-ext/native-host/test-command.js configStatus
node --check /Users/diasmazhenov/vibecode/esf-ext/extension/popup.js
node --check /Users/diasmazhenov/vibecode/esf-ext/extension/service-worker.js
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/test-sign.sh \
  "/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/sdk/localserver/AUTH_RSA256_CUSTOMER_NEW.p12" \
  "Qwerty12"
```

Result before user setup:

```json
{
  "message": "not-configured",
  "configured": false,
  "ok": true,
  "command": "configStatus"
}
```

### Java/JDK
OpenJDK 21 was installed via Homebrew. It is keg-only, so use direct path:

```bash
/opt/homebrew/opt/openjdk@21/bin/java
/opt/homebrew/opt/openjdk@21/bin/javac
/opt/homebrew/opt/openjdk@21/bin/jar
```

Checked:

```bash
/opt/homebrew/opt/openjdk@21/bin/java -version
```

Result: OpenJDK `21.0.11`.

### SDK XML Signing Bridge
Built:

```bash
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/build.sh
```

Verified real XML signature smoke test with bundled SDK sample cert:

```bash
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/test-sign.sh \
  "/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/sdk/localserver/AUTH_RSA256_CUSTOMER_NEW.p12" \
  "Qwerty12"
```

Result:

```text
sign xml ok
```

## Known Sample Values From SDK SoapUI
Found in `Документация ЭСФ SDK/sdk/soapui/ESF-SDK-soapui-project.xml`:

```text
iin: 123456789011
tin: 123456789021
sample certificate: AUTH_RSA256_CUSTOMER_NEW.p12
working sample PIN: Qwerty12
other sample PINs seen: Aa123456, TestPass123, password
```

These are test/sample values only. Do not put real PIN in extension storage.

## Current Plan Status
Plan file:

```text
/Users/diasmazhenov/vibecode/esf-ext/esf-touchid-auth-plan.md
```

Completed:
- auth-flow documented;
- MV3 extension scaffold created;
- Swift native host created;
- Native Messaging `ping -> pong` verified;
- Touch ID command added;
- Java SDK signing bridge created and verified with sample `.p12`;
- stable Chrome extension ID added to manifest: `bjokedaeolojcgaaanfhpofelnfgkebk`;
- native host registered for that Chrome extension ID;
- Chrome launched with unpacked extension via a temporary profile;
- popup login reached Touch ID successfully;
- Keychain-backed config commands added to native host;
- popup setup form added for IIN/`.p12` path/PIN.
- popup has a native file picker button for `.p12` path;
- SDK XML signing is wired into native host command `signXml`;
- Java `SignXml` now reads PIN from env `ESF_CERT_PIN` instead of requiring PIN in argv;
- content script injects `Войти через Touch ID` into the ESF web login method modal;
- content script match uses `https://esf.gov.kz/*`; do not include `:8443` in Chrome match patterns.
- extension version bumped to display `0.1.07` (`manifest.version` is `0.1.7`, `manifest.version_name` is `0.1.07`).

Pending:
- Reload extension in Chrome and verify setup save -> Touch ID unlock path.
- Verify content script button appears in ESF login modal.
- Implement SOAP `AuthService.createAuthTicket`.
- Implement SOAP calls for `createAuthTicket`, `createSessionSigned`, `currentSessionStatus`, `closeSession`.
- Test against ESF test stand.

## Next Step
1. In `chrome://extensions`, click reload on `ESF Touch ID Auth`.
2. Open the extension popup.
3. Fill:
   - ИИН
   - click `Выбрать` for `.p12` or paste full path
   - PIN ЭЦП
4. Click `Сохранить настройку`.
5. Click `Войти`.
6. Complete Touch ID.
7. Verify popup shows `PIN открыт через Touch ID`.

## Security Rules
- Never store real PIN in Chrome extension storage.
- Browser side may store only short-lived `sessionId`/status.
- Native host owns Touch ID, Keychain, `.p12` loading, and signing.
- Real PIN should go to macOS Keychain only, ideally protected with biometric access control.
