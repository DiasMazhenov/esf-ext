const SESSION_KEY = 'esfSession';
const NATIVE_HOST = 'kz.esf.touchid';

const readSession = async () => {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return result[SESSION_KEY] || null;
};

const writeSession = async (session) => {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
};

const clearSession = async () => {
  await chrome.storage.session.remove(SESSION_KEY);
};

const sendNativeCommand = (command, payload = {}) => new Promise((resolve, reject) => {
  chrome.runtime.sendNativeMessage(NATIVE_HOST, { command, ...payload }, (response) => {
    const error = chrome.runtime.lastError;
    if (error) {
      reject(new Error(error.message));
      return;
    }
    resolve(response);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleCommand(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

async function handleCommand(message) {
  switch (message?.command) {
    case 'saveConfig': {
      const nativeResponse = await sendNativeCommand('saveConfig', {
        iin: message.iin,
        certificatePath: message.certificatePath,
        pin: message.pin
      });

      if (!nativeResponse?.ok) {
        return { ok: false, error: nativeResponse?.message || 'Настройка не сохранена.' };
      }

      return {
        ok: true,
        status: 'OK',
        title: 'Настройка сохранена',
        detail: 'PIN сохранён в macOS Keychain. В Chrome он не хранится.'
      };
    }
    case 'chooseCertificate': {
      const nativeResponse = await sendNativeCommand('chooseCertificate');
      if (!nativeResponse?.ok) {
        if (nativeResponse?.message?.includes('User canceled')) {
          return { ok: false, error: 'Выбор файла отменён.' };
        }
        return { ok: false, error: nativeResponse?.message || 'Файл не выбран.' };
      }

      return {
        ok: true,
        status: 'OK',
        title: 'Файл выбран',
        detail: nativeResponse.certificatePath,
        certificatePath: nativeResponse.certificatePath
      };
    }
    case 'signXml': {
      const nativeResponse = await sendNativeCommand('signXml', { xml: message.xml });
      if (!nativeResponse?.ok) {
        return { ok: false, error: nativeResponse?.message || 'XML не подписан.' };
      }

      return {
        ok: true,
        status: 'OK',
        title: 'XML подписан',
        detail: 'Auth ticket готов для createSessionSigned.',
        signedXml: nativeResponse.signedXml
      };
    }
    case 'login': {
      const nativeResponse = await sendNativeCommand('unlockPin');
      if (!nativeResponse?.ok) {
        if (nativeResponse?.message === 'setup-required') {
          return { ok: false, error: 'Сначала заполните настройку ЭЦП и сохраните PIN в Keychain.' };
        }
        return { ok: false, error: nativeResponse?.message || 'Touch ID check failed.' };
      }

      const session = {
        id: `touchid-${Date.now()}`,
        status: 'OK',
        createdAt: new Date().toISOString(),
        nativeMessage: nativeResponse.message
      };
      await writeSession(session);
      return {
        ok: true,
        status: 'OK',
        title: 'PIN открыт через Touch ID',
        detail: 'Следующий шаг: подписать auth ticket через SDK bridge.'
      };
    }
    case 'status': {
      const nativeResponse = await sendNativeCommand('configStatus');
      const session = await readSession();
      if (!session) {
        const configDetail = nativeResponse?.configured
          ? `ЭЦП настроена: ${nativeResponse.certificatePath}`
          : 'Сначала сохраните путь к .p12 и PIN в Keychain.';
        return {
          ok: true,
          status: nativeResponse?.configured ? 'Ready' : 'Setup',
          title: nativeResponse?.configured ? 'Готово к входу' : 'Нужна настройка',
          detail: configDetail
        };
      }
      return {
        ok: true,
        status: session.status,
        title: 'Сессия сохранена',
        detail: `ID: ${session.id}`
      };
    }
    case 'logout': {
      await clearSession();
      return {
        ok: true,
        status: 'Closed',
        title: 'Сессия закрыта',
        detail: 'Локальное значение sessionId очищено.'
      };
    }
    case 'nativePing': {
      const nativeResponse = await sendNativeCommand('ping');
      return {
        ok: nativeResponse?.ok === true,
        status: nativeResponse?.ok ? 'OK' : 'Error',
        title: 'Native Messaging',
        detail: nativeResponse?.message || 'Нет ответа.'
      };
    }
    default:
      return { ok: false, error: `Unknown command: ${message?.command || 'empty'}` };
  }
}
