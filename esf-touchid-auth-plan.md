# ESF Touch ID Auth Extension

## Goal
Сделать Chrome extension + macOS native helper, который открывает/обновляет сессию ИС ЭСФ через ЭЦП, но разрешает использование ключа через Touch ID.

## Tasks
- [x] Зафиксировать auth-flow SDK: `AuthService.createAuthTicket` -> подпись XML Dsig -> `SessionService.createSessionSigned` -> `sessionId`. Verify: есть список endpoint/WSDL и обязательных полей.
- [x] Создать каркас Chrome extension MV3 в `/Users/diasmazhenov/vibecode/esf-ext/extension`. Verify: Chrome загружает unpacked extension без ошибок.
- [x] Создать macOS native host в `/Users/diasmazhenov/vibecode/esf-ext/native-host`. Verify: extension получает ответ `ping/pong` через Native Messaging.
- [x] Добавить Touch ID gate в native host через macOS LocalAuthentication/Keychain. Verify: без Touch ID секрет не возвращается, после Touch ID доступ разрешен.
- [x] Зарегистрировать Chrome Native Messaging host для стабильного dev extension ID `bjokedaeolojcgaaanfhpofelnfgkebk`. Verify: `allowed_origins` указывает на этот ID.
- [x] Добавить настройку ЭЦП: ИИН, TIN, путь к `.p12`, PIN в macOS Keychain. Verify: native `configStatus` возвращает `not-configured/configured`, PIN не хранится в Chrome.
- [x] Добавить выбор `.p12` через native macOS file picker. Verify: popup button `Выбрать` вызывает native command `chooseCertificate`.
- [x] Заменить file picker на AppleScript `choose file`, потому что `NSOpenPanel` из Chrome native host не открывался видимо. Verify: Swift build passes.
- [x] Ввести версионирование display-формата `0.1.03`. Verify: manifest `version_name` = `0.1.03`, техническая Chrome `version` = `0.1.3`.
- [ ] Проверить popup setup/login в Chrome: save config -> click “Войти” -> Touch ID -> `PIN открыт через Touch ID`. Verify: popup получает успешный ответ от native host.
- [ ] Подключить SDK signing: загрузка `.p12`, PIN из Keychain, подпись auth ticket/XML. Verify: на тестовом ключе SDK возвращает подпись и сертификат.
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
