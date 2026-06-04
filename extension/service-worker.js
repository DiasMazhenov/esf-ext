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

const sendNativeCommand = (command) => new Promise((resolve, reject) => {
  chrome.runtime.sendNativeMessage(NATIVE_HOST, { command }, (response) => {
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
    case 'login': {
      const nativeResponse = await sendNativeCommand('touchIdCheck');
      if (!nativeResponse?.ok) {
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
        title: 'Touch ID подтвержден',
        detail: 'Следующий шаг: открыть PIN из Keychain и подписать auth ticket.'
      };
    }
    case 'status': {
      const session = await readSession();
      if (!session) {
        return {
          ok: true,
          status: 'Idle',
          title: 'Сессии нет',
          detail: 'Нажмите вход, чтобы проверить Touch ID через native host.'
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
