const TOUCH_ID_BUTTON_ID = 'esf-touchid-login-button';
const STATUS_ID = 'esf-touchid-login-status';

const normalizeText = (value) => (value || '').replace(/\s+/g, ' ').trim();

const isVisible = (element) => {
  if (!element) {
    return false;
  }
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && style.opacity !== '0'
    && rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
};

const findByText = (selector, text) => {
  const target = normalizeText(text);
  return [...document.querySelectorAll(selector)]
    .find((element) => isVisible(element) && normalizeText(element.textContent).includes(target)) || null;
};

const findAuthModal = () => {
  const dialogs = [...document.querySelectorAll('[role="dialog"], .ReactModal__Content')];
  const modal = dialogs.find((dialog) => isVisible(dialog) && normalizeText(dialog.textContent).includes('Способ авторизации'));
  if (modal) {
    return modal;
  }

  const header = findByText('div, h1, h2, h3', 'Способ авторизации');
  return header?.closest('[role="dialog"], .ReactModal__Content') || null;
};

const findButtonContainer = (modal) => {
  const root = modal || document;
  const buttons = [...root.querySelectorAll('button')];
  const ecpButton = buttons.find((button) => isVisible(button) && normalizeText(button.textContent).includes('Войти с помощью ЭЦП'));
  if (ecpButton?.parentElement) {
    return { container: ecpButton.parentElement, before: ecpButton };
  }

  const globalEcpButton = findByText('button', 'Войти с помощью ЭЦП');
  if (globalEcpButton?.parentElement) {
    return { container: globalEcpButton.parentElement, before: globalEcpButton };
  }

  const fallbackContainer = [...root.querySelectorAll('[class*="SelectMethodModal_container"]')].find(isVisible);
  return fallbackContainer ? { container: fallbackContainer, before: fallbackContainer.firstElementChild } : null;
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
  [...document.querySelectorAll(`#${TOUCH_ID_BUTTON_ID}`)].forEach((button) => {
    if (!isVisible(button)) {
      button.remove();
    }
  });

  const modal = findAuthModal();
  const target = findButtonContainer(modal);
  const container = target?.container;
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

  container.insertBefore(button, target.before || container.firstElementChild);
  console.info('[ESF Touch ID Auth] Login button injected', { container, before: target.before });
};

const observer = new MutationObserver(injectTouchIdButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
console.info('[ESF Touch ID Auth] Content script loaded');
injectTouchIdButton();

let attempts = 0;
const interval = window.setInterval(() => {
  injectTouchIdButton();
  attempts += 1;
  const injectedButton = document.querySelector(`#${TOUCH_ID_BUTTON_ID}`);
  if (attempts >= 120 || (injectedButton && isVisible(injectedButton))) {
    window.clearInterval(interval);
  }
}, 500);
