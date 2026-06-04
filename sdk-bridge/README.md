# SDK Bridge

This folder is for the Java/Kalkan ESF SDK signing bridge.

## Current blocker

The downloaded ESF SDK signing code depends on Java. On this machine, `java -jar` currently fails with macOS Java Runtime missing message, so signing cannot be executed yet.

Install a JDK before implementing/running signer commands.

## SDK evidence

SDK local server entrypoint:

```bash
cd "/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/sdk/localserver"
java -jar esf_local_server.jar
```

Source samples:
- `examples/localserver/DocumentSigner.java` loads `.p12` by `certificatePath` + `certificatePin` and signs XML/data.
- `examples/localserver/EsfLocalService.java` exposes local SOAP methods for document and XML signatures.

Relevant SDK jars:
- `kalkan-0.7.2.jar`
- `kalkan-xmldsig-0.4.jar`
- `knca_provider_util-0.8.jar`
- `trusty-0.12.4.jar`
- `esf-client-v4.0.0.jar`
- `esf-client-model-v4.0.0.jar`

## SoapUI signed session sample values

Found in `Документация ЭСФ SDK/sdk/soapui/ESF-SDK-soapui-project.xml`:

- `AuthService.createAuthTicket` input `iin`: `123456789011`
- `SessionService.createSessionSigned` input `tin`: `123456789021`
- sample signing certificate path in scenario: `GOST512_22250bebb873f26867499a69b53964d36377fea2.p12`
- sample certificate PIN in scenario: `Aa123456`
- alternate suite sample `certificatePin`: `Qwerty12`

These are SDK test/sample values only. Real user PIN must never be stored in Chrome extension storage.

## Next implementation shape

1. Add a Java CLI around `DocumentSigner.signatureXmlResponse(xml, certificatePath, certificatePin)`.
2. Native Swift host gets PIN from Keychain after Touch ID.
3. Native Swift host calls Java CLI with auth ticket XML via stdin or temp file.
4. Java CLI returns signed XML only.
5. Native Swift host calls ESF SOAP `createSessionSigned` or returns signed ticket to a session client.


## Verified locally

Java runtime installed via Homebrew:

```bash
/opt/homebrew/opt/openjdk@21/bin/java -version
```

`SignXml` bridge compiled successfully:

```bash
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/build.sh
```

Local signing smoke test passed with bundled SDK sample certificate:

```bash
/Users/diasmazhenov/vibecode/esf-ext/sdk-bridge/test-sign.sh \
  "/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/sdk/localserver/AUTH_RSA256_CUSTOMER_NEW.p12" \
  "Qwerty12"
```

Expected output:

```text
sign xml ok
```
