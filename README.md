# ESF Bio Auth

Расширение Chrome MV3 для авторизации и подписания документов в ИС ЭСФ.
На macOS системная биометрия открывает локальный PIN сертификата через Swift
Native Messaging host. ЭСФ по-прежнему получает официальную подпись на основе
сертификата; биометрия используется только как локальное подтверждение.

## Состав проекта

- `extension/` - расширение Chrome для загрузки в режиме unpacked.
- `native-host/` - Swift Native Messaging host и работа с macOS Keychain.
- `sdk-bridge/` - Java/Kalkan bridge с JAR-файлами SDK внутри проекта.
- `build-macos.sh` - сборка переносимого пакета macOS.
- `macos/install.sh` - установка host и runtime в стабильную папку.

Скачанная папка `esf-sdk-2025` не нужна для работы. Необходимые JAR-файлы SDK
уже находятся в `sdk-bridge/lib`.

## Требования

- macOS и Google Chrome.
- OpenJDK 21. Установка: `brew install openjdk@21`, либо укажите
  `ESF_JAVA_HOME`.
- Сертификат ЭЦП `.p12` и его PIN.
- Mac с Touch ID или другим поддерживаемым способом биометрии macOS.

Постоянный ID расширения задаётся ключом в manifest:
`bjokedaeolojcgaaanfhpofelnfgkebk`.

## Сборка macOS

Из корня репозитория выполните:

```bash
./build-macos.sh
```

Для текущей Apple Silicon машины результатом будет:

```text
dist/ESF-Bio-Auth-macOS-arm64-v0.1.56.zip
```

Пакет содержит расширение, Swift host, Java bridge и все JAR-файлы SDK.
По умолчанию host собирается под текущую архитектуру Mac.

Для запроса universal-сборки arm64/x86_64:

```bash
MACOS_UNIVERSAL=1 ./build-macos.sh
```

Для universal-сборки macOS SDK должен поддерживать кросс-компиляцию обеих
архитектур.

## Установка на macOS

Распакуйте ZIP и запустите:

```bash
./install-macos.sh
```

Runtime будет установлен в:

```text
~/Library/Application Support/ESF Bio Auth/
```

Установщик также зарегистрирует Native Messaging host для Chrome. Затем в
`chrome://extensions`:

1. Включите **Режим разработчика**.
2. Нажмите **Загрузить распакованное расширение**.
3. Выберите `~/Library/Application Support/ESF Bio Auth/extension`.
4. Перезагрузите расширение и вкладку ESF.

Если Chrome показывает ошибку Native Messaging, проверьте ID загруженного
расширения: `bjokedaeolojcgaaanfhpofelnfgkebk`. Manifest host должен указывать
на установленный файл `native-host/bin/esf-touchid-native-host`.

## Настройка и использование

1. Откройте popup расширения.
2. Введите ИИН и выберите сертификат `.p12`.
3. Введите PIN ЭЦП и сохраните настройку. PIN хранится в macOS Keychain, а не
   в хранилище Chrome.
4. Откройте ЭСФ и нажмите **Войти через биометрию**.
5. Для ЭСФ или АВР в окне подписания нажмите **Подписать через биометрию**.

Страница ЭСФ использует свой штатный flow. Расширение передаёт локальную
подпись после подтверждения биометрией.

## Проверки разработчика

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

Не добавляйте в Git `.p12`, PIN, экспорт Keychain, debug trace и сгенерированные
runtime-файлы. Debug trace может содержать данные документов.

## Ограничения

- Chrome требует вручную загрузить unpacked-расширение. Публикация в Chrome Web
  Store - отдельный этап.
- OpenJDK 21 должен быть установлен на целевом Mac; JDK не включён в ZIP.
- Основной flow использует локальный SDK bridge. Код NCALayer оставлен только
  как debug fallback.
