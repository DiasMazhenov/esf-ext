# ESF Bio Auth Extension Context

## Communication
- Отвечай коротко и по делу.
- Проектные файлы находятся в `/Users/diasmazhenov/vibecode/esf-ext`.
- GitHub repo: `https://github.com/DiasMazhenov/esf-ext` (private).
- Цель: Chrome extension + macOS native helper для удобного входа в ИС ЭСФ через официальную ЭЦП, где системная биометрия только локально разрешает использование ключа/PIN.
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

Chrome popup login was manually verified by the user with biometric confirmation.

### Keychain Config / ESF Session
Native host now supports:

```text
saveConfig
configStatus
unlockPin
chooseCertificate
createAuthTicket
createSignedSession
createSessionFromSignedTicket
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
- Native `createSignedSession` flow:
  1. creates `authTicketXml` through `AuthService.createAuthTicket`;
  2. asks Touch ID;
  3. reads PIN from Keychain;
  4. signs ticket through `sdk-bridge/bin/sign-xml`;
  5. calls `SessionService.createSessionSigned`;
  6. returns `sessionId` to the extension.
- Experimental NCALayer flow:
  1. native host creates `authTicketXml`;
  2. extension asks NCALayer at `wss://127.0.0.1:13579/` or `ws://127.0.0.1:13579/`;
  3. NCALayer signs through `kz.gov.pki.knca.commonUtils.signXml`;
  4. extension sends signed ticket back to native command `createSessionFromSignedTicket`;
  5. native host calls `SessionService.createSessionSigned`.
- Debug XML files are written locally under `~/Library/Application Support/kz.esf.touchid/debug`.
- The floating site panel is raised above the footer: `bottom: 124px`.

Verified:

```bash
/Users/diasmazhenov/vibecode/esf-ext/native-host/build.sh
node /Users/diasmazhenov/vibecode/esf-ext/native-host/test-ping.js
node /Users/diasmazhenov/vibecode/esf-ext/native-host/test-command.js configStatus
node --check /Users/diasmazhenov/vibecode/esf-ext/extension/popup.js
node --check /Users/diasmazhenov/vibecode/esf-ext/extension/service-worker.js
node /Users/diasmazhenov/vibecode/esf-ext/native-host/test-command.js createAuthTicket
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

Latest live `createAuthTicket` check against the configured ESF endpoint:

```json
{
  "ok": true,
  "command": "createAuthTicket",
  "message": "auth-ticket-created",
  "authTicketXmlLength": 223
}
```

Current extension version:

```text
0.1.38
```

Next verification step:

```text
Open ESF login modal -> click floating "Войти через биометрию" panel -> biometric confirmation -> SDK signs web ticket -> ESF web login completes.
```

Latest fix:

```text
Popup `Через NCA` now delegates signing to the active ESF tab content script, so NCALayer signing also runs in page context.
`createSessionSigned` now saves the full SOAP request as `create-session-signed-request` debug XML and marks empty SOAP WS-Security header in errors.
`createSessionSigned` debug package now includes request XML, response XML, and `create-session-signed-trace.json` with ticket/signature metadata.
`createSessionSigned` now adds official WS-Security UsernameToken when optional SOAP password is saved in Keychain.
NCA site flow now continues after SOAP `sessionId` into ESF web login: `/ajax/login/ticket` -> NCALayer official auth signature -> `/ajax/login/xmlDsigCertInfo` -> `/ajax/login` -> reload app.
NCALayer parser now accepts signed XML returned as `body.result[0]`, which is how the official auth dialog can return `<authSign>...`.
NCA web-login prompt now calls the second password the ESF web cabinet password, not SOAP password, and states it is not saved by the extension.
Primary `Войти через биометрию` flow no longer uses NCALayer: content script fetches `/ajax/login/ticket`, native host signs it through the local SDK bridge, unlocks saved ESF web password from Keychain after biometric confirmation, then content script posts `/ajax/login`.
Popup active-tab validation now accepts `https://esf.gov.kz:8443/...` by checking URL hostname instead of string prefix, and stale NCALayer wording was removed from the error.
Popup was redesigned with accent `#006196`, extension icons, logo near `ESF Bio Auth`, hidden config form when status is `Ready/OK`, and a `Ввести новые данные` edit button.
Primary labels now say `биометрия` instead of `Touch ID`; NCALayer bridge is no longer auto-injected and remains debug-only fallback.
Content script auto-dismisses the ESF NCALayer warning modal by clicking its `OK` button when the exact warning/link text is detected.
Accent color changed to `#006196`; ESF page widget is now a bottom-right compact popup with only the extension logo as the biometric login button.
The bottom-right logo widget is now always injected on ESF pages, including `/esf-web/app`; it no longer waits for the auth-method modal text.
The bottom-right logo widget is hidden when the ESF authenticated header is detected by `UserInfoT2`/TIN plus the `Выйти` button.
Temporary network debug capture is enabled on ESF pages: page-context script logs fetch/XHR method, URL, request body, status, response text, and calls to `selectSignMethod`, `tumAdapter.signRequest`, `getQRSignSignature` into `chrome.storage.local`; popup can clear/download the trace JSON.
`signing.js` shows AWP QR signing flow uses `getQRSignSignature(data, docType)` and sends hashes to `mobileDocSign/sign/qr?wssId=...&documentTypeForSign=...`; ECP flow still needs trace of the callback/tumAdapter path.
If downloaded trace is empty, likely the ESF tab still had an older content script; popup `Очистить` now also asks the active ESF tab to install the debug bridge and reports if the tab must be reloaded.
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
- content script shows `Войти через биометрию` when the ESF web login method modal is open;
- content script match uses `https://esf.gov.kz/*`; do not include `:8443` in Chrome match patterns.
- content script no longer injects inside the React modal. It shows a fixed floating Touch ID panel above the page when body text contains `Способ авторизации` and `Войти с помощью ЭЦП`.
- floating Touch ID panel is positioned 100px higher than before (`bottom: 124px`).
- native host has SOAP `createAuthTicket` command for `AuthService.createAuthTicket` on `https://esf.gov.kz:8443/esf-web/ws/api1/AuthService`.
- native host creates ESF signed sessions through `createAuthTicket -> Touch ID -> signXml -> createSessionSigned`;
- `signedAuthTicket` is sent as CDATA, matching SDK SoapUI samples;
- Java `SignXml` validates that the ticket IIN matches the selected certificate and that the XML signature method is GOST512, not RSA;
- `createSessionSigned` sends empty `SOAPAction`, matching SDK WSDL/SoapUI;
- Java `SignXml` verifies the generated XML signature locally and emits sanitized diagnostics: `localVerify`, `signatureMethod`, certificate subject/issuer/notAfter;
- popup header shows `version_name` next to `ESF Bio Auth`;
- native diagnostics filter SLF4J noise before returning errors to Chrome;
- popup and site floating panel have `Через NCA` / `Войти через NCA Layer` fallback buttons;
- extension service worker signs `authTicketXml` through NCALayer commonUtils `signXml`;
- NCALayer WebSocket endpoints include `wss://127.0.0.1:13579/` and `wss://localhost:13579/`;
- manifest has explicit `content_security_policy.extension_pages.connect-src` for NCALayer WebSocket URLs;
- `ws://` endpoints were removed because NCALayer returns invalid HTTP response on plain WebSocket;
- if Chrome rejects the local WSS certificate, popup tells the user to open `https://127.0.0.1:13579/` and accept the certificate in the same Chrome profile;
- `page-ncalayer.js` can be injected as a page-context bridge only by the debug-only NCA fallback;
- site `Войти через NCA Layer` signs inside the ESF page context, then sends the signed ticket to native host;
- NCALayer greeting messages containing only `result.version` are ignored in both page bridge and service worker;
- popup `Через NCA` uses the active ESF tab and content script command `loginViaPageNcaLayer`; it no longer signs from service worker by default;
- `createSessionSigned` saves the full SOAP request to debug and adds `wsSecurityHeader=empty`/`tinLength` diagnostics to SOAP errors;
- `createSessionSigned` writes a debug trace JSON with source, SOAPAction, WS-Security mode, ticket IIN match, timemark, state length, signature/digest/c14n methods, transforms, signature length, certificate length;
- popup has optional `Пароль ИС ЭСФ` field; native host stores it in macOS Keychain and uses it for WS-Security UsernameToken and web `/ajax/login`;
- site/popup NCA login now attempts official ESF web login after SOAP session creation and reloads `/esf-web/app` on success;
- native host accepts external signed tickets through `createSessionFromSignedTicket`;
- local debug XML snapshots are saved under Application Support for comparison and are not committed;
- NCALayer response parser accepts array payloads such as `body.result[0]` for official auth signatures;
- NCA web-login status/prompt now uses `API session` and `web cabinet password` wording to avoid confusing it with SOAP password;
- primary Touch ID web login no longer uses NCALayer: SDK bridge signs the ESF web ticket and native host returns the saved ESF password after Touch ID;
- visible NCALayer buttons were removed from popup and site panel; NCA code remains only as fallback/debug path;
- popup accepts active ESF tabs on port `8443` for biometric web-login handoff;
- popup hides credential fields when configured and exposes `Ввести новые данные` for updates;
- manifest uses extension icons from `extension/icons` and popup shows the logo near `ESF Bio Auth`;
- visible labels were renamed from Touch ID to biometrics, while native host still uses macOS LocalAuthentication;
- NCALayer fallback is marked debug-only and the page bridge is no longer auto-injected during normal login;
- ESF NCALayer warning modal is auto-dismissed by exact text match so it does not block the biometric login panel;
- accent color changed to `#006196` in popup and ESF page widget;
- ESF page widget moved to bottom-right and now shows only logo button, which starts the same biometric web-login flow;
- ESF page widget no longer depends on detecting the auth modal and appears on `/esf-web/app`;
- ESF page widget is hidden after login when the authenticated header with user info and `Выйти` is present;
- temporary ESF network trace captures fetch/XHR plus signing function calls locally and can be cleared/downloaded from popup;
- popup `Очистить` activates debug bridge on the active ESF tab, reducing empty trace risk after extension reload;
- extension version bumped to display `0.1.38` (`manifest.version` is `0.1.38`, `manifest.version_name` is `0.1.38`).

Pending:
- Reload extension in Chrome and verify full ESF login flow returns `sessionId`.
- Start NCALayer and test `Войти через NCA Layer`.
- If Java bridge returns `unsupported-signature-method`, choose a GOST512 NCA `.p12` certificate instead of RSA.
- Implement SOAP calls for `currentSessionStatus`, `closeSession`.
- Test against ESF test stand.

## Next Step
1. In `chrome://extensions`, click reload on `ESF Bio Auth`.
2. Open ESF login modal.
3. Click the floating `Войти через биометрию` panel.
4. Complete biometric confirmation.
5. Verify ESF returns `sessionId` or a clear SOAP error.

## Security Rules
- Never store real PIN in Chrome extension storage.
- Browser side may store only short-lived `sessionId`/status.
- Native host owns biometric confirmation, Keychain, `.p12` loading, and signing.
- Real PIN should go to macOS Keychain only, ideally protected with biometric access control.
