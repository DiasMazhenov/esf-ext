const TOUCH_ID_PANEL_ID = 'esf-touchid-login-panel';
const STATUS_ID = 'esf-touchid-login-status';
const PAGE_BRIDGE_ID = 'esf-touchid-ncalayer-page-bridge';
const NCA_REQUEST_TYPE = 'ESF_TOUCHID_NCA_SIGN_REQUEST';
const NCA_RESPONSE_TYPE = 'ESF_TOUCHID_NCA_SIGN_RESPONSE';

const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();

const pageHasAuthModal = () => {
  const bodyText = normalizeText(document.body?.innerText);
  return bodyText.includes('Способ авторизации') && bodyText.includes('Войти с помощью ЭЦП');
};

const setStatus = (message, type = 'idle') => {
  const status = document.querySelector(`#${STATUS_ID}`);
  if (!status) {
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

const signXmlViaPageNcaLayer = (xml) => new Promise((resolve, reject) => {
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
  window.postMessage({ type: NCA_REQUEST_TYPE, requestId, xml }, window.location.origin);
});

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

const ensureTouchIdPanel = () => {
  if (!pageHasAuthModal()) {
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
  button.textContent = 'Войти через Touch ID';

  const ncaButton = document.createElement('button');
  ncaButton.type = 'button';
  ncaButton.textContent = 'Войти через NCA Layer';

  const status = document.createElement('div');
  status.id = STATUS_ID;
  status.textContent = 'Расширение готово';

  const runLogin = async (command, busyText, fallbackText) => {
    button.disabled = true;
    ncaButton.disabled = true;
    setStatus(busyText, 'busy');
    try {
      const response = await chrome.runtime.sendMessage({ command });
      if (!response?.ok) {
        setStatus(response?.error || fallbackText, 'error');
        return;
      }
      setStatus(response.detail || response.title || 'Touch ID подтверждён.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      button.disabled = false;
      ncaButton.disabled = false;
    }
  };

  const runPageNcaLogin = async () => {
    button.disabled = true;
    ncaButton.disabled = true;
    try {
      const response = await runNcaLayerLogin();
      if (!response?.ok) {
        setStatus(response?.error || 'Не удалось выполнить вход через NCA Layer.', 'error');
        return;
      }
      setStatus(response.detail || response.title || 'Сессия создана через NCA Layer.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      button.disabled = false;
      ncaButton.disabled = false;
    }
  };

  button.addEventListener('click', () => {
    runLogin('login', 'Проверка Touch ID...', 'Не удалось выполнить вход через Touch ID.');
  });

  ncaButton.addEventListener('click', () => {
    runPageNcaLogin();
  });

  panel.append(button, ncaButton, status);
  document.documentElement.append(panel);
  console.info('[ESF Touch ID Auth] Floating login panel injected');
};

const observer = new MutationObserver(ensureTouchIdPanel);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
console.info('[ESF Touch ID Auth] Content script loaded');
ensurePageBridge();
ensureTouchIdPanel();
window.setInterval(ensureTouchIdPanel, 500);
