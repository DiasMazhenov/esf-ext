const TOUCH_ID_BUTTON_ID = 'esf-touchid-login-button';
const STATUS_ID = 'esf-touchid-login-status';

const findAuthModal = () => {
  const dialogs = [...document.querySelectorAll('[role="dialog"], .ReactModal__Content')];
  return dialogs.find((dialog) => dialog.textContent?.includes('Способ авторизации')) || null;
};

const findButtonContainer = (modal) => {
  const buttons = [...modal.querySelectorAll('button')];
  const ecpButton = buttons.find((button) => button.textContent?.trim() === 'Войти с помощью ЭЦП');
  return ecpButton?.parentElement || null;
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
  if (!modal || modal.querySelector(`#${TOUCH_ID_BUTTON_ID}`)) {
    return;
  }

  const container = findButtonContainer(modal);
  if (!container) {
    return;
  }

  const button = document.createElement('button');
  button.id = TOUCH_ID_BUTTON_ID;
  button.type = 'button';
  button.className = 'esf-touchid-button';
  button.textContent = 'Войти через Touch ID';

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
};

const observer = new MutationObserver(injectTouchIdButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
injectTouchIdButton();
