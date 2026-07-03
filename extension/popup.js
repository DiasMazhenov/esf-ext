const statusBadge = document.querySelector('#statusBadge');
const versionLabel = document.querySelector('#versionLabel');
const sessionStatus = document.querySelector('#sessionStatus');
const statusDetail = document.querySelector('#statusDetail');
const configForm = document.querySelector('#configForm');
const editConfigButton = document.querySelector('#editConfigButton');
const iinInput = document.querySelector('#iinInput');
const certificatePathInput = document.querySelector('#certificatePathInput');
const pinInput = document.querySelector('#pinInput');
const soapPasswordInput = document.querySelector('#soapPasswordInput');
const chooseCertificateButton = document.querySelector('#chooseCertificateButton');
const saveConfigButton = document.querySelector('#saveConfigButton');
const loginButton = document.querySelector('#loginButton');
const checkButton = document.querySelector('#checkButton');
const logoutButton = document.querySelector('#logoutButton');
const downloadTraceButton = document.querySelector('#downloadTraceButton');
const clearTraceButton = document.querySelector('#clearTraceButton');

versionLabel.textContent = `v${chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version}`;

let editingConfig = false;

const shouldHideConfig = (response) => {
  const configuredTitles = new Set([
    'Настройка сохранена',
    'Сессия сохранена',
    'Web-вход выполнен',
    'Сессия ИС ЭСФ создана'
  ]);

  return !editingConfig
    && response?.ok
    && (response.status === 'Ready' || configuredTitles.has(response.title));
};

const updateConfigVisibility = (response) => {
  const hideConfig = shouldHideConfig(response);
  configForm.hidden = hideConfig;
  editConfigButton.hidden = !hideConfig;

  if (response?.iin && !iinInput.value) {
    iinInput.value = response.iin;
  }

  if (response?.certificatePath && !certificatePathInput.value) {
    certificatePathInput.value = response.certificatePath;
  }
};

const setBusy = (busy) => {
  chooseCertificateButton.disabled = busy;
  saveConfigButton.disabled = busy;
  editConfigButton.disabled = busy;
  loginButton.disabled = busy;
  checkButton.disabled = busy;
  logoutButton.disabled = busy;
  downloadTraceButton.disabled = busy;
  clearTraceButton.disabled = busy;
  if (busy) {
    statusBadge.textContent = 'Busy';
    statusBadge.className = 'badge badge-busy';
  }
};

const render = (response) => {
  updateConfigVisibility(response);

  if (!response?.ok) {
    statusBadge.textContent = 'Error';
    statusBadge.className = 'badge badge-error';
    sessionStatus.textContent = 'Ошибка';
    statusDetail.textContent = response?.error || 'Команда не выполнена.';
    return;
  }

  statusBadge.textContent = response.status || 'OK';
  statusBadge.className = ['OK', 'Ready'].includes(response.status) ? 'badge badge-ok' : 'badge';
  sessionStatus.textContent = response.title || 'Готово';
  statusDetail.textContent = response.detail || '';
};

const sendCommand = async (command, payload = {}) => {
  setBusy(true);
  try {
    const response = await chrome.runtime.sendMessage({ command, ...payload });
    render(response);
  } catch (error) {
    render({ ok: false, error: error.message });
  } finally {
    setBusy(false);
  }
};

configForm.addEventListener('submit', (event) => {
  event.preventDefault();
  editingConfig = false;
  sendCommand('saveConfig', {
    iin: iinInput.value,
    certificatePath: certificatePathInput.value,
    pin: pinInput.value,
    soapPassword: soapPasswordInput.value
  }).then(() => {
    pinInput.value = '';
    soapPasswordInput.value = '';
  });
});

editConfigButton.addEventListener('click', () => {
  editingConfig = true;
  configForm.hidden = false;
  editConfigButton.hidden = true;
  pinInput.focus();
});

chooseCertificateButton.addEventListener('click', async () => {
  setBusy(true);
  try {
    const response = await chrome.runtime.sendMessage({ command: 'chooseCertificate' });
    if (response?.ok && response.certificatePath) {
      certificatePathInput.value = response.certificatePath;
    }
    render(response);
  } catch (error) {
    render({ ok: false, error: error.message });
  } finally {
    setBusy(false);
  }
});

loginButton.addEventListener('click', () => sendCommand('login'));
checkButton.addEventListener('click', () => sendCommand('status'));
logoutButton.addEventListener('click', () => sendCommand('logout'));

downloadTraceButton.addEventListener('click', async () => {
  setBusy(true);
  try {
    const response = await chrome.runtime.sendMessage({ command: 'getNetworkDebug' });
    if (!response?.ok) {
      render(response);
      return;
    }

    const blob = new Blob([JSON.stringify(response.trace || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `esf-network-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    render(response);
  } catch (error) {
    render({ ok: false, error: error.message });
  } finally {
    setBusy(false);
  }
});

clearTraceButton.addEventListener('click', () => sendCommand('clearNetworkDebug'));

sendCommand('status');
