const SESSION_KEY = 'esfSession';
const NETWORK_DEBUG_KEY = 'esfNetworkDebugTrace';
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

const readNetworkDebugTrace = async () => {
  const result = await chrome.storage.local.get(NETWORK_DEBUG_KEY);
  return Array.isArray(result[NETWORK_DEBUG_KEY]) ? result[NETWORK_DEBUG_KEY] : [];
};

const writeNetworkDebugTrace = async (trace) => {
  await chrome.storage.local.set({ [NETWORK_DEBUG_KEY]: trace.slice(-300) });
};

const clearNetworkDebugTrace = async () => {
  await chrome.storage.local.remove(NETWORK_DEBUG_KEY);
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

// Debug-only fallback. Main login uses the native SDK bridge and never calls NCALayer.
const sendActiveEsfTabCommand = async (payload) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  let activeUrl;
  try {
    activeUrl = activeTab?.url ? new URL(activeTab.url) : null;
  } catch {
    activeUrl = null;
  }

  if (!activeTab?.id || activeUrl?.protocol !== 'https:' || activeUrl.hostname !== 'esf.gov.kz') {
    return {
      ok: false,
      error: 'Откройте активную вкладку ESF и нажмите вход снова. Web-вход выполняется через страницу ESF.'
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
    case 'recordNetworkDebug': {
      const trace = await readNetworkDebugTrace();
      trace.push(message.entry);
      await writeNetworkDebugTrace(trace);
      return { ok: true, status: 'OK', title: 'Trace saved', detail: `${trace.length + 1}` };
    }
    case 'getNetworkDebug': {
      const trace = await readNetworkDebugTrace();
      return {
        ok: true,
        status: 'OK',
        title: 'Network trace',
        detail: trace.length
          ? `${trace.length} entries`
          : '0 entries. Если действие уже было выполнено, перезагрузите вкладку ESF после reload расширения и повторите запись.',
        trace
      };
    }
    case 'clearNetworkDebug': {
      await clearNetworkDebugTrace();
      const installResponse = await sendActiveEsfTabCommand({ command: 'installNetworkDebug' });
      return {
        ok: true,
        status: 'OK',
        title: 'Network trace очищен',
        detail: installResponse?.ok
          ? 'Debug trace активен на текущей вкладке ESF. Можно начинать чистую запись.'
          : `Trace очищен. ${installResponse?.error || 'Перезагрузите вкладку ESF, чтобы включить запись.'}`
      };
    }
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
    case 'signWebTicket': {
      const nativeResponse = await sendNativeCommand('signWebTicket', { xml: message.xml });
      if (!nativeResponse?.ok) {
        if (nativeResponse?.message === 'web-password-not-found') {
          return { ok: false, error: 'Сохраните пароль ИС ЭСФ в настройке расширения.' };
        }
        if (nativeResponse?.message === 'setup-required') {
          return { ok: false, error: 'Сначала заполните настройку ЭЦП и сохраните PIN в Keychain.' };
        }
        return { ok: false, error: nativeResponse?.message || 'Web ticket не подписан.' };
      }

      return {
        ok: true,
        status: 'OK',
        title: 'Web ticket подписан',
        detail: 'Пароль ИС ЭСФ получен из Keychain после биометрии.',
        signedXml: nativeResponse.signedXml,
        webPassword: nativeResponse.webPassword
      };
    }
    case 'login': {
      return sendActiveEsfTabCommand({ command: 'loginViaTouchIdWeb' });
    }
    case 'loginViaTouchIdWeb': {
      return sendActiveEsfTabCommand({ command: 'loginViaTouchIdWeb' });
    }
    case 'createApiSession': {
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
      // Debug-only fallback kept for comparing ESF/NCALayer signature formats.
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
          detail: configDetail,
          iin: nativeResponse?.iin,
          certificatePath: nativeResponse?.certificatePath
        };
      }
      return {
        ok: true,
        status: session.status,
        title: 'Сессия сохранена',
        detail: `ID: ${session.id}`,
        iin: nativeResponse?.iin,
        certificatePath: nativeResponse?.certificatePath
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
