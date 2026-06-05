const SESSION_KEY = 'esfSession';
const NATIVE_HOST = 'kz.esf.touchid';
const NCA_LAYER_ENDPOINTS = [
  'wss://127.0.0.1:13579/',
  'wss://localhost:13579/'
];

const isNcaGreeting = (response) => Boolean(response?.result?.version && !response.responseObject);

const extractStringPayload = (payload) => {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractStringPayload(item);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (payload && typeof payload === 'object') {
    return extractStringPayload(payload.xml ?? payload.signedXml ?? payload.result ?? payload.body ?? payload.data);
  }

  return null;
};

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

const extractNcaPayload = (response) => {
  if (!response || typeof response !== 'object') {
    throw new Error('NCALayer вернул пустой ответ.');
  }

  if (response.code && String(response.code) !== '200') {
    throw new Error(response.message || response.responseObject || `NCALayer code ${response.code}`);
  }

  if (response.status === false) {
    throw new Error(response.message || response.error || 'NCALayer command failed.');
  }

  const payload = response.responseObject ?? response.result ?? response.body?.result ?? response.body ?? response.data;
  const signedXml = extractStringPayload(payload);
  if (signedXml) {
    return signedXml;
  }

  throw new Error(`NCALayer response не содержит signed XML: ${JSON.stringify(response).slice(0, 300)}`);
};

const sendNcaLayerRequest = (request) => new Promise((resolve, reject) => {
  const endpoints = [...NCA_LAYER_ENDPOINTS];
  const failures = [];
  let socket;
  let timer;

  const finish = (callback, value) => {
    clearTimeout(timer);
    callback(value);
  };

  const tryNextEndpoint = () => {
    const endpoint = endpoints.shift();
    if (!endpoint) {
      finish(reject, new Error(
        `Chrome не доверяет локальному сертификату NCALayer. Откройте https://127.0.0.1:13579/ в этом же Chrome, примите сертификат, затем повторите. Проверенные адреса: ${failures.join('; ')}`
      ));
      return;
    }

    clearTimeout(timer);
    try {
      socket = new WebSocket(endpoint);
    } catch (error) {
      failures.push(`${endpoint}: ${error.message}`);
      tryNextEndpoint();
      return;
    }
    timer = setTimeout(() => {
      failures.push(`${endpoint}: timeout`);
      socket.close();
      tryNextEndpoint();
    }, 60000);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(request));
    });
    socket.addEventListener('message', (event) => {
      let shouldClose = true;
      try {
        const response = JSON.parse(event.data);
        if (isNcaGreeting(response)) {
          shouldClose = false;
          return;
        }
        finish(resolve, extractNcaPayload(response));
      } catch (error) {
        finish(reject, error);
      } finally {
        if (shouldClose) {
          socket.close();
        }
      }
    });
    socket.addEventListener('error', () => {
      failures.push(`${endpoint}: websocket error`);
      socket.close();
      tryNextEndpoint();
    });
  };

  tryNextEndpoint();
});

const signXmlViaNcaLayer = async (xml) => sendNcaLayerRequest({
  module: 'kz.gov.pki.knca.commonUtils',
  method: 'signXml',
  args: ['PKCS12', 'SIGNATURE', xml, '', '']
});

const sendActiveEsfTabCommand = async (payload) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id || !activeTab.url?.startsWith('https://esf.gov.kz/')) {
    return {
      ok: false,
      error: 'Откройте активную вкладку ESF и нажмите кнопку снова. NCALayer из popup работает через страницу ESF.'
    };
  }

  try {
    return await chrome.tabs.sendMessage(activeTab.id, payload);
  } catch (error) {
    return {
      ok: false,
      error: `Не удалось связаться со страницей ESF. Перезагрузите вкладку ESF. ${error.message}`
    };
  }
};

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
        pin: message.pin,
        soapPassword: message.soapPassword
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
    case 'createAuthTicket': {
      const nativeResponse = await sendNativeCommand('createAuthTicket');
      if (!nativeResponse?.ok) {
        return { ok: false, error: nativeResponse?.message || 'Auth ticket не получен.' };
      }

      return {
        ok: true,
        status: 'OK',
        title: 'Auth ticket получен',
        detail: 'Следующий шаг: подписать auth ticket.',
        authTicketXml: nativeResponse.authTicketXml
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
      const nativeResponse = await sendNativeCommand('createSignedSession');
      if (!nativeResponse?.ok) {
        if (nativeResponse?.message === 'setup-required') {
          return { ok: false, error: 'Сначала заполните настройку ЭЦП и сохраните PIN в Keychain.' };
        }
        return { ok: false, error: nativeResponse?.message || 'Сессия ИС ЭСФ не создана.' };
      }

      const session = {
        id: nativeResponse.sessionId,
        status: 'OK',
        createdAt: new Date().toISOString(),
        nativeMessage: nativeResponse.message
      };
      await writeSession(session);
      return {
        ok: true,
        status: 'OK',
        title: 'Сессия ИС ЭСФ создана',
        detail: `sessionId: ${nativeResponse.sessionId}`
      };
    }
    case 'loginViaNcaLayer': {
      if (message.useActiveTab !== false && !message.signedAuthTicket) {
        return sendActiveEsfTabCommand({ command: 'loginViaPageNcaLayer' });
      }

      const signedAuthTicket = message.signedAuthTicket || await (async () => {
        const ticketResponse = await sendNativeCommand('createAuthTicket');
        if (!ticketResponse?.ok) {
          throw new Error(ticketResponse?.message || 'Auth ticket не получен.');
        }
        return signXmlViaNcaLayer(ticketResponse.authTicketXml);
      })();
      const nativeResponse = await sendNativeCommand('createSessionFromSignedTicket', { signedAuthTicket });
      if (!nativeResponse?.ok) {
        return { ok: false, error: nativeResponse?.message || 'Сессия через NCALayer не создана.' };
      }

      const session = {
        id: nativeResponse.sessionId,
        status: 'OK',
        createdAt: new Date().toISOString(),
        nativeMessage: nativeResponse.message,
        signedBy: 'ncalayer'
      };
      await writeSession(session);
      return {
        ok: true,
        status: 'OK',
        title: 'Сессия ИС ЭСФ создана через NCALayer',
        detail: `sessionId: ${nativeResponse.sessionId}`
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
