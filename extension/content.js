const TOUCH_ID_PANEL_ID = 'esf-touchid-login-panel';
const STATUS_ID = 'esf-touchid-login-status';

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

  button.addEventListener('click', () => {
    runLogin('login', 'Проверка Touch ID...', 'Не удалось выполнить вход через Touch ID.');
  });

  ncaButton.addEventListener('click', () => {
    runLogin('loginViaNcaLayer', 'Ожидание подписи в NCA Layer...', 'Не удалось выполнить вход через NCA Layer.');
  });

  panel.append(button, ncaButton, status);
  document.documentElement.append(panel);
  console.info('[ESF Touch ID Auth] Floating login panel injected');
};

const observer = new MutationObserver(ensureTouchIdPanel);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
console.info('[ESF Touch ID Auth] Content script loaded');
ensureTouchIdPanel();
window.setInterval(ensureTouchIdPanel, 500);
