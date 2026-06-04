# ESF Touch ID Auth Extension

## Goal
Сделать Chrome extension + macOS native helper, который открывает/обновляет сессию ИС ЭСФ через ЭЦП, но разрешает использование ключа через Touch ID.

## Tasks
- [x] Зафиксировать auth-flow SDK: `AuthService.createAuthTicket` -> подпись XML Dsig -> `SessionService.createSessionSigned` -> `sessionId`. Verify: есть список endpoint/WSDL и обязательных полей.
- [x] Создать каркас Chrome extension MV3 в `/Users/diasmazhenov/vibecode/esf-ext/extension`. Verify: Chrome загружает unpacked extension без ошибок.
- [x] Создать macOS native host в `/Users/diasmazhenov/vibecode/esf-ext/native-host`. Verify: extension получает ответ `ping/pong` через Native Messaging.
- [x] Добавить Touch ID gate в native host через macOS LocalAuthentication/Keychain. Verify: без Touch ID секрет не возвращается, после Touch ID доступ разрешен.
- [x] Зарегистрировать Chrome Native Messaging host для стабильного dev extension ID `bjokedaeolojcgaaanfhpofelnfgkebk`. Verify: `allowed_origins` указывает на этот ID.
- [x] Добавить настройку ЭЦП: ИИН, путь к `.p12`, PIN в macOS Keychain; `tin` для API выводится из ИИН. Verify: native `configStatus` возвращает `not-configured/configured`, PIN не хранится в Chrome.
- [x] Добавить выбор `.p12` через native macOS file picker. Verify: popup button `Выбрать` вызывает native command `chooseCertificate`.
- [x] Заменить file picker на AppleScript `choose file`, потому что `NSOpenPanel` из Chrome native host не открывался видимо. Verify: Swift build passes.
- [x] Ввести версионирование display-формата `0.1.17`. Verify: manifest `version_name` = `0.1.17`, техническая Chrome `version` = `0.1.17`.
- [x] Добавить кнопку `Войти через Touch ID` в модалку способов авторизации ИС ЭСФ через content script. Verify: content script watches modal by text `Способ авторизации` and injects button.
- [x] Исправить content script match для сайта ИС ЭСФ. Verify: `matches` uses `https://esf.gov.kz/*`, not port-specific pattern.
- [x] Усилить injection кнопки в модалку ИС ЭСФ. Verify: content script finds existing `Войти с помощью ЭЦП` button globally and injects into its parent.
- [x] Исправить injection при скрытых ReactModal duplicate nodes. Verify: content script targets only visible auth buttons and keeps polling until visible injected button exists.
- [x] Заменить встраивание в ReactModal на fixed floating panel поверх страницы. Verify: panel appears when auth modal text is present in body.
- [x] Поднять fixed floating panel на 100px. Verify: `content.css` uses `bottom: 124px`.
- [ ] Проверить popup setup/login в Chrome: save config -> click “Войти” -> Touch ID -> `PIN открыт через Touch ID`. Verify: popup получает успешный ответ от native host.
- [ ] Проверить кнопку на сайте ИС ЭСФ: открыть модалку входа -> увидеть `Войти через Touch ID` -> получить текущий native login status.
- [x] Подключить SDK signing: загрузка `.p12`, PIN из Keychain, подпись auth ticket/XML. Verify: Java bridge smoke test returns `sign xml ok`; native host has `signXml`.
- [x] Подключить SOAP `AuthService.createAuthTicket`. Verify: native host builds and exposes `createAuthTicket`.
- [x] Проверить `createAuthTicket` against ESF endpoint with current config. Verify: native response contains `authTicketXml`.
- [x] Передавать `authTicketXml` в native `signXml`. Verify: native `createSignedSession` flow signs the ticket after Touch ID.
- [x] Реализовать вызов `SessionService.createSessionSigned`. Verify: native host has `createSignedSession` and returns `sessionId` when ESF accepts the signed ticket.
- [x] Исправить `signedAuthTicket` для `createSessionSigned`: отправлять signed XML через CDATA как в SDK SoapUI samples. Verify: Swift build passes.
- [x] Добавить локальную проверку сертификата перед SOAP: ИИН в ticket должен совпадать с сертификатом, signature method должен быть GOST512. Verify: RSA sample fails locally with clear error.
- [x] Исправить HTTP `SOAPAction` для `createSessionSigned` на пустой, как в WSDL/SDK SoapUI, и добавить diagnostics в SOAP error. Verify: Swift build passes.
- [x] Добавить локальную XMLDSig verify-проверку после подписи и sanitized certificate diagnostics в native error. Verify: Java bridge and Swift build pass.
- [x] Показать текущую версию в popup рядом с названием и убрать SLF4J noise из diagnostics. Verify: JS syntax and Swift build pass.
- [ ] Проверить полный сайтовый flow: floating panel -> Touch ID -> signed auth ticket -> `sessionId`. Verify: ESF session is created or SOAP error is shown clearly.
- [ ] Реализовать session manager: хранить `sessionId`, проверять `currentSessionStatus`, переоткрывать при `CLOSED/NOT_FOUND`. Verify: мок/тестовый вызов показывает reuse и renew.
- [ ] Подключить тестовый стенд `test3.esf.kgd.gov.kz:8443`. Verify: создается сессия на тестовом стенде или получаем понятную ошибку доступа/сертификата.
- [ ] Минимальный UI расширения: статус сессии, кнопка входа, кнопка закрытия сессии. Verify: пользователь видит `OK/CLOSED/NOT_FOUND` и может вручную закрыть сессию.
- [ ] Phase X: Verification. Verify: полный сценарий Chrome -> Touch ID -> подпись -> `sessionId` -> status check проходит на тестовом стенде.

## Done When
- [ ] Пользователь один раз настраивает ЭЦП, дальше вход/обновление сессии запускается из Chrome через Touch ID.
- [ ] PIN/секреты не лежат в extension storage и не передаются в браузер.
- [ ] Если сессия умерла, расширение само переоткрывает ее после Touch ID.

## Notes
Touch ID не заменяет ЭЦП юридически и технически. Он только локально разрешает использовать сохраненный ключ/секрет. Максимальный TTL найден только у auth ticket: `ttlInMinutes` до 1440 минут; срок жизни `sessionId` API явно не задает.
