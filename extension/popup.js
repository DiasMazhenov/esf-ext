const statusBadge = document.querySelector('#statusBadge');
const sessionStatus = document.querySelector('#sessionStatus');
const statusDetail = document.querySelector('#statusDetail');
const configForm = document.querySelector('#configForm');
const iinInput = document.querySelector('#iinInput');
const tinInput = document.querySelector('#tinInput');
const certificatePathInput = document.querySelector('#certificatePathInput');
const pinInput = document.querySelector('#pinInput');
const chooseCertificateButton = document.querySelector('#chooseCertificateButton');
const saveConfigButton = document.querySelector('#saveConfigButton');
const loginButton = document.querySelector('#loginButton');
const checkButton = document.querySelector('#checkButton');
const logoutButton = document.querySelector('#logoutButton');

const setBusy = (busy) => {
  chooseCertificateButton.disabled = busy;
  saveConfigButton.disabled = busy;
  loginButton.disabled = busy;
  checkButton.disabled = busy;
  logoutButton.disabled = busy;
  if (busy) {
    statusBadge.textContent = 'Busy';
    statusBadge.className = 'badge badge-busy';
  }
};

const render = (response) => {
  if (!response?.ok) {
    statusBadge.textContent = 'Error';
    statusBadge.className = 'badge badge-error';
    sessionStatus.textContent = 'Ошибка';
    statusDetail.textContent = response?.error || 'Команда не выполнена.';
    return;
  }

  statusBadge.textContent = response.status || 'OK';
  statusBadge.className = response.status === 'OK' ? 'badge badge-ok' : 'badge';
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
  sendCommand('saveConfig', {
    iin: iinInput.value,
    tin: tinInput.value,
    certificatePath: certificatePathInput.value,
    pin: pinInput.value
  }).then(() => {
    pinInput.value = '';
  });
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

sendCommand('status');
