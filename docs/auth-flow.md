# ESF Auth Flow

## Goal
Use official ESF certificate-based authentication, while Touch ID only unlocks local access to the certificate/PIN through the macOS native helper.

## Source SDK
- SDK root: `/Users/diasmazhenov/Downloads/esf-sdk-2025`
- Main doc: `Документация ЭСФ SDK/Документация по сессиям.docx`
- Session WSDL in SDK: `Документация ЭСФ SDK/api-wsdl/SessionService.wsdl`

## Services

### Test stand
- `SessionService`: `https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/SessionService`
- `AuthService`: `https://test3.esf.kgd.gov.kz:8443/esf-web/ws/api1/AuthService`

### Production WSDL observed in bundled WSDL
- `SessionService`: `https://esf.gov.kz:8443/esf-web/ws/api1/SessionService`

## Preferred Login Flow

1. Call `AuthService.createAuthTicket`.
   - Input: `CreateAuthTicketRequest`
   - Required: `iin` string
   - Optional: `ttlInMinutes` integer
   - TTL range: `1..1440`, default `30`
   - Output: `authTicketXml`

2. Native helper signs `authTicketXml` as XML Dsig.
   - Input to signer: XML ticket from ESF
   - Certificate source: local `.p12`
   - PIN source: macOS Keychain after Touch ID
   - Output: signed XML string

3. Call `SessionService.createSessionSigned`.
   - Input: `CreateSessionSignedRequest`
   - Required: `tin` string, enterprise BIN on behalf of which user acts
   - Required: `signedAuthTicket` string, signed XML Dsig
   - Optional: `projectCode` long
   - Optional: `businessProfileType`
   - Optional: `sourceType`
   - Output: `CreateSessionResponse.sessionId`

4. Store `sessionId` in extension runtime/session storage only.
   - Do not store PIN in extension storage.
   - Do not send `.p12` contents or PIN to browser JS.

5. Before business API calls, check `SessionService.currentSessionStatus`.
   - Input: `sessionId`
   - Expected statuses: `OK`, `CLOSED`, `NOT_FOUND`
   - If `OK`: reuse session.
   - If `CLOSED` or `NOT_FOUND`: ask Touch ID and repeat flow.

6. Logout calls `SessionService.closeSession` with `sessionId`.

## Legacy/Alternate Flow

`SessionService.createSession` can create a session directly with certificate data.

Required fields:
- `tin`: enterprise BIN
- `x509Certificate`: PEM/Base64 X.509 certificate issued by the CA for auth/authz

This flow proves that ESF auth remains certificate-based. It does not provide Touch ID as a server-side auth factor.

## Security Boundary

Touch ID is not ESF authentication. Touch ID only unlocks local access to the certificate PIN or signing operation. ESF still receives certificate-based signed/authenticated data.

Browser extension responsibilities:
- start login/status/logout commands;
- display status;
- hold only short-lived `sessionId`.

Native helper responsibilities:
- Touch ID prompt;
- Keychain access;
- `.p12` loading;
- XML signing;
- SOAP calls that require certificate/signing material.

## Open Checks

- Verify actual `AuthService?wsdl` from the test stand, because the downloaded WSDL folder only includes `SessionService.wsdl`.
- Confirm whether test stand requires whitelisted test certificates or accepts the bundled sample `.p12` files.
- Confirm real `sessionId` idle/absolute lifetime empirically; SDK exposes status checks but no session TTL setting.
