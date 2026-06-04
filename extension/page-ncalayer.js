(function () {
  const REQUEST_TYPE = 'ESF_TOUCHID_NCA_SIGN_REQUEST';
  const RESPONSE_TYPE = 'ESF_TOUCHID_NCA_SIGN_RESPONSE';
  const ENDPOINTS = ['wss://127.0.0.1:13579/', 'wss://localhost:13579/'];

  const isNcaGreeting = (response) => Boolean(response?.result?.version && !response.responseObject);

  const extractPayload = (response) => {
    if (!response || typeof response !== 'object') {
      throw new Error('NCALayer вернул пустой ответ.');
    }

    if (response.code && String(response.code) !== '200') {
      throw new Error(response.message || response.responseObject || `NCALayer code ${response.code}`);
    }

    if (response.status === false) {
      throw new Error(response.message || response.error || 'NCALayer command failed.');
    }

    const payload = response.responseObject ?? response.result ?? response.body ?? response.data;
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const nested = payload.xml ?? payload.signedXml ?? payload.result;
      if (typeof nested === 'string' && nested.trim()) {
        return nested;
      }
    }

    throw new Error(`NCALayer response не содержит signed XML: ${JSON.stringify(response).slice(0, 300)}`);
  };

  const sendRequest = (request) => new Promise((resolve, reject) => {
    const endpoints = [...ENDPOINTS];
    const failures = [];
    let socket;
    let timer;

    const finish = (callback, value) => {
      clearTimeout(timer);
      callback(value);
    };

    const tryNext = () => {
      const endpoint = endpoints.shift();
      if (!endpoint) {
        finish(reject, new Error(`NCALayer недоступен из страницы ESF: ${failures.join('; ')}`));
        return;
      }

      try {
        socket = new WebSocket(endpoint);
      } catch (error) {
        failures.push(`${endpoint}: ${error.message}`);
        tryNext();
        return;
      }

      timer = setTimeout(() => {
        failures.push(`${endpoint}: timeout`);
        socket.close();
        tryNext();
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
          finish(resolve, extractPayload(response));
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
        tryNext();
      });
    };

    tryNext();
  });

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.type !== REQUEST_TYPE) {
      return;
    }

    const { requestId, xml } = event.data;
    try {
      const signedXml = await sendRequest({
        module: 'kz.gov.pki.knca.commonUtils',
        method: 'signXml',
        args: ['PKCS12', 'SIGNATURE', xml, '', '']
      });
      window.postMessage({ type: RESPONSE_TYPE, requestId, ok: true, signedXml }, window.location.origin);
    } catch (error) {
      window.postMessage({ type: RESPONSE_TYPE, requestId, ok: false, error: error.message }, window.location.origin);
    }
  });
})();
