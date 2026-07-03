const TOUCH_ID_PANEL_ID = 'esf-touchid-login-panel';
const STATUS_ID = 'esf-touchid-login-status';
const PAGE_BRIDGE_ID = 'esf-touchid-ncalayer-page-bridge';
const NETWORK_DEBUG_BRIDGE_ID = 'esf-bio-network-debug-bridge';
const NCA_REQUEST_TYPE = 'ESF_TOUCHID_NCA_SIGN_REQUEST';
const NCA_RESPONSE_TYPE = 'ESF_TOUCHID_NCA_SIGN_RESPONSE';
const NETWORK_DEBUG_EVENT_TYPE = 'ESF_BIO_NETWORK_DEBUG_EVENT';

const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();

const dismissNcaLayerWarningModal = () => {
  const dialogs = [...document.querySelectorAll('.ReactModal__Overlay, [role="dialog"]')];
  for (const dialog of dialogs) {
    if (dialog.dataset.esfBioNcaWarningDismissed === 'true') {
      continue;
    }

    const text = normalizeText(dialog.innerText);
    const isNcaWarning = text.includes('Убедитесь, что приложение') &&
      text.includes('NCALayer') &&
      text.includes('pki.gov.kz/ncalayer');
    if (!isNcaWarning) {
      continue;
    }

    dialog.dataset.esfBioNcaWarningDismissed = 'true';
    const okButton = [...dialog.querySelectorAll('button')]
      .find((buttonElement) => normalizeText(buttonElement.innerText) === 'OK');
    if (okButton) {
      okButton.click();
      return;
    }

    const overlay = dialog.classList.contains('ReactModal__Overlay')
      ? dialog
      : dialog.closest('.ReactModal__Overlay');
    overlay?.remove();
    return;
  }
};

const pageHasAuthenticatedHeader = () => {
  const hasUserInfo = Boolean(
    document.querySelector('[class*="UserInfoT2_wrapper"], [class*="TaxpayerLayoutHeader_userInfo"]')
  );
  const hasTin = Boolean(document.querySelector('[class*="UserInfoT2_tin"]'));
  const hasLogout = [...document.querySelectorAll('button')]
    .some((buttonElement) => normalizeText(buttonElement.innerText) === 'Выйти');

  return (hasUserInfo || hasTin) && hasLogout;
};

const setStatus = (message, type = 'idle') => {
  const status = document.querySelector(`#${STATUS_ID}`);
  if (!status) {
    const panelButton = document.querySelector(`#${TOUCH_ID_PANEL_ID} button`);
    if (panelButton) {
      panelButton.title = message;
      panelButton.dataset.type = type;
      panelButton.setAttribute('aria-label', message);
    }
    return;
  }
  status.textContent = message;
  status.dataset.type = type;
};

const removePanel = () => {
  document.querySelector(`#${TOUCH_ID_PANEL_ID}`)?.remove();
};

const ensurePageBridge = () => {
  if (document.querySelector(`#${PAGE_BRIDGE_ID}`)) {
    return;
  }

  const script = document.createElement('script');
  script.id = PAGE_BRIDGE_ID;
  script.src = chrome.runtime.getURL('page-ncalayer.js');
  script.onload = () => script.remove();
  document.documentElement.append(script);
};

const ensureNetworkDebugBridge = () => {
  if (document.querySelector(`#${NETWORK_DEBUG_BRIDGE_ID}`)) {
    return;
  }

  const script = document.createElement('script');
  script.id = NETWORK_DEBUG_BRIDGE_ID;
  script.src = chrome.runtime.getURL('page-network-debug.js');
  script.onload = () => script.remove();
  document.documentElement.append(script);
};

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== NETWORK_DEBUG_EVENT_TYPE) {
    return;
  }

  chrome.runtime.sendMessage({
    command: 'recordNetworkDebug',
    entry: event.data.entry
  }).catch(() => {
    // Debug capture must never break the ESF page.
  });
});

// Debug-only fallback for comparing NCALayer signatures. Main login does not call this.
const signXmlViaPageNcaLayer = (xml, mode = 'soap') => new Promise((resolve, reject) => {
  ensurePageBridge();

  const requestId = `nca-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const timer = window.setTimeout(() => {
    window.removeEventListener('message', handleResponse);
    reject(new Error('NCALayer не ответил за 60 секунд.'));
  }, 60000);

  function handleResponse(event) {
    if (event.source !== window || event.data?.type !== NCA_RESPONSE_TYPE || event.data.requestId !== requestId) {
      return;
    }

    window.clearTimeout(timer);
    window.removeEventListener('message', handleResponse);

    if (!event.data.ok) {
      reject(new Error(event.data.error || 'NCALayer не подписал XML.'));
      return;
    }

    resolve(event.data.signedXml);
  }

  window.addEventListener('message', handleResponse);
  window.postMessage({ type: NCA_REQUEST_TYPE, requestId, xml, mode }, window.location.origin);
});

const postForm = async (url, values) => {
  const body = new FormData();
  Object.entries(values).forEach(([key, value]) => body.append(key, value));
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || data?.error || text || `HTTP ${response.status}`);
  }
  return data;
};

const postJsonText = async (url, text) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: text
  });
  const data = await response.json();
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
  }
  return data;
};

const runOfficialWebLogin = async () => {
  setStatus('Получение web ticket сайта...', 'busy');
  const ticketResponse = await fetch('/esf-web/ajax/login/ticket', {
    credentials: 'include',
    headers: { Accept: 'text/plain,*/*' }
  });
  const ticketXml = await ticketResponse.text();
  if (!ticketResponse.ok || !ticketXml.trim().startsWith('<')) {
    throw new Error(`Web ticket не получен: ${ticketXml.slice(0, 120)}`);
  }

  setStatus('Подпись web ticket через NCALayer...', 'busy');
  const xmlDsig = await signXmlViaPageNcaLayer(ticketXml, 'official-auth');

  setStatus('Проверка сертификата сайтом...', 'busy');
  const certInfo = await postJsonText('/esf-web/ajax/login/xmlDsigCertInfo', xmlDsig);
  const certificate = certInfo.base64Cert || certInfo.base64Pem;
  const login = certInfo.iin;
  if (!certificate || !login) {
    throw new Error('Сайт не вернул ИИН/сертификат после подписи.');
  }

  const password = window.prompt('Введите пароль от web-кабинета ИС ЭСФ. Он нужен сайту для /ajax/login и не сохраняется расширением.');
  if (!password) {
    throw new Error('Пароль ИС ЭСФ не введён.');
  }

  setStatus('Вход в web-интерфейс ESF...', 'busy');
  await postForm('/esf-web/ajax/login', {
    login,
    password,
    certificate,
    xmlDsig
  });

  setStatus('Web-вход выполнен, обновляю страницу...', 'ok');
  window.setTimeout(() => {
    window.location.assign('/esf-web/app');
  }, 700);
};

const runTouchIdWebLogin = async () => {
  setStatus('Получение web ticket сайта...', 'busy');
  const ticketResponse = await fetch('/esf-web/ajax/login/ticket', {
    credentials: 'include',
    headers: { Accept: 'text/plain,*/*' }
  });
  const ticketXml = await ticketResponse.text();
  if (!ticketResponse.ok || !ticketXml.trim().startsWith('<')) {
    throw new Error(`Web ticket не получен: ${ticketXml.slice(0, 120)}`);
  }

  setStatus('Биометрия: подпись ticket и открытие пароля...', 'busy');
  const signResponse = await chrome.runtime.sendMessage({ command: 'signWebTicket', xml: ticketXml });
  if (!signResponse?.ok) {
    throw new Error(signResponse?.error || 'Web ticket не подписан.');
  }

  const xmlDsig = signResponse.signedXml;
  const password = signResponse.webPassword;
  if (!xmlDsig || !password) {
    throw new Error('Native host не вернул подпись или пароль ИС ЭСФ.');
  }

  setStatus('Проверка сертификата сайтом...', 'busy');
  const certInfo = await postJsonText('/esf-web/ajax/login/xmlDsigCertInfo', xmlDsig);
  const certificate = certInfo.base64Cert || certInfo.base64Pem;
  const login = certInfo.iin;
  if (!certificate || !login) {
    throw new Error('Сайт не вернул ИИН/сертификат после подписи.');
  }

  setStatus('Вход в web-интерфейс ESF...', 'busy');
  await postForm('/esf-web/ajax/login', {
    login,
    password,
    certificate,
    xmlDsig
  });

  setStatus('Web-вход выполнен, обновляю страницу...', 'ok');
  window.setTimeout(() => {
    window.location.assign('/esf-web/app');
  }, 700);

  return {
    ok: true,
    status: 'OK',
    title: 'Web-вход выполнен',
    detail: 'Страница ESF обновляется.'
  };
};

const runNcaLayerLogin = async () => {
  setStatus('Получение auth ticket...', 'busy');
  const ticketResponse = await chrome.runtime.sendMessage({ command: 'createAuthTicket' });
  if (!ticketResponse?.ok) {
    throw new Error(ticketResponse?.error || 'Auth ticket не получен.');
  }

  setStatus('Ожидание подписи в NCA Layer...', 'busy');
  const signedAuthTicket = await signXmlViaPageNcaLayer(ticketResponse.authTicketXml);

  setStatus('Создание сессии ИС ЭСФ...', 'busy');
  return chrome.runtime.sendMessage({ command: 'loginViaNcaLayer', signedAuthTicket });
};

const runNcaLayerWebLogin = async () => {
  const response = await runNcaLayerLogin();
  if (!response?.ok) {
    throw new Error(response?.error || 'Не удалось создать API session через NCA Layer.');
  }
  setStatus('API session создана. Запускаю web-вход...', 'busy');
  await runOfficialWebLogin();
  return {
    ok: true,
    status: 'OK',
    title: 'Web-вход выполнен',
    detail: 'Страница ESF обновляется.'
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.command === 'loginViaTouchIdWeb') {
    runTouchIdWebLogin()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.command !== 'loginViaPageNcaLayer') {
    return false;
  }

  runNcaLayerWebLogin()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

const ensureTouchIdPanel = () => {
  dismissNcaLayerWarningModal();

  if (pageHasAuthenticatedHeader()) {
    removePanel();
    return;
  }

  if (document.querySelector(`#${TOUCH_ID_PANEL_ID}`)) {
    return;
  }

  const panel = document.createElement('div');
  panel.id = TOUCH_ID_PANEL_ID;

  const button = document.createElement('button');
  button.type = 'button';
  button.title = 'Войти через биометрию';
  button.setAttribute('aria-label', 'Войти через биометрию');

  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icons/icon-48.png');
  logo.alt = '';

  const runLogin = async (command, busyText, fallbackText) => {
    button.disabled = true;
    setStatus(busyText, 'busy');
    try {
      const response = await chrome.runtime.sendMessage({ command });
      if (!response?.ok) {
        setStatus(response?.error || fallbackText, 'error');
        return;
      }
      setStatus(response.detail || response.title || 'Биометрия подтверждена.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  button.addEventListener('click', () => {
    runLogin('loginViaTouchIdWeb', 'Проверка биометрии...', 'Не удалось выполнить вход через биометрию.');
  });

  button.append(logo);
  panel.append(button);
  document.documentElement.append(panel);
  console.info('[ESF Bio Auth] Floating login panel injected');
};

const observer = new MutationObserver(ensureTouchIdPanel);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
console.info('[ESF Bio Auth] Content script loaded');
ensureNetworkDebugBridge();
ensureTouchIdPanel();
window.setInterval(ensureTouchIdPanel, 500);
