const TOUCH_ID_BUTTON_ID = 'esf-touchid-login-button';
const STATUS_ID = 'esf-touchid-login-status';

const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();

const findByText = (selector, text) => {
  const target = normalizeText(text);
  return [...document.querySelectorAll(selector)].find((element) => normalizeText(element.textContent).includes(target)) || null;
};

const findAuthModal = () => {
  const dialogs = [...document.querySelectorAll('[role="dialog"], .ReactModal__Content')];
  const modal = dialogs.find((dialog) => normalizeText(dialog.textContent).includes('Способ авторизации'));
  if (modal) {
    return modal;
  }

  const header = findByText('div, h1, h2, h3', 'Способ авторизации');
  return header?.closest('[role="dialog"], .ReactModal__Content') || null;
};

const findButtonContainer = (modal) => {
  const root = modal || document;
  const buttons = [...root.querySelectorAll('button')];
  const ecpButton = buttons.find((button) => normalizeText(button.textContent).includes('Войти с помощью ЭЦП'));
  if (ecpButton?.parentElement) {
    return ecpButton.parentElement;
  }

  const globalEcpButton = findByText('button', 'Войти с помощью ЭЦП');
  return globalEcpButton?.parentElement || root.querySelector('[class*="SelectMethodModal_container"]') || null;
};

const setStatus = (container, message, type = 'idle') => {
  let status = container.querySelector(`#${STATUS_ID}`);
  if (!status) {
    status = document.createElement('div');
    status.id = STATUS_ID;
    status.className = 'esf-touchid-status';
    container.append(status);
  }
  status.textContent = message;
  status.dataset.type = type;
};

const injectTouchIdButton = () => {
  const modal = findAuthModal();
  const container = findButtonContainer(modal);
  if (!container || container.querySelector(`#${TOUCH_ID_BUTTON_ID}`)) {
    return;
  }

  const button = document.createElement('button');
  button.id = TOUCH_ID_BUTTON_ID;
  button.type = 'button';
  button.className = 'esf-touchid-button';
  button.textContent = 'Войти через Touch ID';

  const sampleButton = findByText('button', 'Войти с помощью ЭЦП');
  if (sampleButton?.className) {
    button.className = `${sampleButton.className} esf-touchid-button`;
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    setStatus(container, 'Проверка Touch ID...', 'busy');
    try {
      const response = await chrome.runtime.sendMessage({ command: 'login' });
      if (!response?.ok) {
        setStatus(container, response?.error || 'Не удалось выполнить вход через Touch ID.', 'error');
        return;
      }
      setStatus(container, response.detail || response.title || 'Touch ID подтверждён.', 'ok');
    } catch (error) {
      setStatus(container, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  container.prepend(button);
  console.info('[ESF Touch ID Auth] Login button injected');
};

const observer = new MutationObserver(injectTouchIdButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
console.info('[ESF Touch ID Auth] Content script loaded');
injectTouchIdButton();

let attempts = 0;
const interval = window.setInterval(() => {
  injectTouchIdButton();
  attempts += 1;
  if (attempts >= 60 || document.querySelector(`#${TOUCH_ID_BUTTON_ID}`)) {
    window.clearInterval(interval);
  }
}, 500);
