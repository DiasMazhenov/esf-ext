(function () {
  const EVENT_TYPE = 'ESF_BIO_NETWORK_DEBUG_EVENT';
  const MAX_TEXT_LENGTH = 200000;

  if (window.__esfBioNetworkDebugInstalled) {
    return;
  }
  window.__esfBioNetworkDebugInstalled = true;

  const truncate = (value) => {
    if (value == null) {
      return null;
    }
    const text = String(value);
    return text.length > MAX_TEXT_LENGTH
      ? `${text.slice(0, MAX_TEXT_LENGTH)}\n...[truncated ${text.length - MAX_TEXT_LENGTH} chars]`
      : text;
  };

  const headersToObject = (headers) => {
    if (!headers) {
      return {};
    }
    try {
      return Object.fromEntries([...headers.entries()]);
    } catch {
      return {};
    }
  };

  const bodyToText = async (body) => {
    if (body == null) {
      return null;
    }
    if (typeof body === 'string') {
      return truncate(body);
    }
    if (body instanceof URLSearchParams) {
      return truncate(body.toString());
    }
    if (body instanceof FormData) {
      const entries = [];
      for (const [key, value] of body.entries()) {
        entries.push([key, value instanceof File ? `[File ${value.name} ${value.size} bytes]` : String(value)]);
      }
      return truncate(JSON.stringify(entries));
    }
    if (body instanceof Blob) {
      return truncate(await body.text());
    }
    return truncate(Object.prototype.toString.call(body));
  };

  const emit = (entry) => {
    window.postMessage({
      type: EVENT_TYPE,
      entry: {
        capturedAt: new Date().toISOString(),
        pageUrl: window.location.href,
        ...entry
      }
    }, window.location.origin);
  };

  const safeJson = (value) => {
    try {
      return truncate(JSON.stringify(value));
    } catch {
      return truncate(String(value));
    }
  };

  const logConsole = (label, value) => {
    try {
      console.info(`[ESF Bio Auth trace] ${label}`, value);
    } catch {
      // Console tracing must never affect ESF page code.
    }
  };

  const summarizeSignPayload = (data) => {
    if (Array.isArray(data)) {
      return {
        type: 'array',
        count: data.length,
        items: data.map((item, index) => ({
          index,
          id: item?.id ?? null,
          hashLength: String(item?.hash ?? item ?? '').length,
          keys: item && typeof item === 'object' ? Object.keys(item) : []
        }))
      };
    }

    return {
      type: typeof data,
      hashLength: data == null ? 0 : String(data).length
    };
  };

  const isReactSignMethodModal = (element) => {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    const text = element.innerText || '';
    return text.includes('Способ подписания') &&
      text.includes('Подписать с помощью ЭЦП') &&
      text.includes('Подписать с помощью QR');
  };

  const ensureReactSignMethodTrace = () => {
    const modals = [...document.querySelectorAll('[role="dialog"], .ReactModal__Content, [class*="SelectMethodModal_wrapper"]')];
    const modal = modals.find(isReactSignMethodModal);
    if (!modal) {
      return;
    }

    if (modal.dataset.esfBioSignModalTraced !== 'true') {
      modal.dataset.esfBioSignModalTraced = 'true';
      const buttons = [...modal.querySelectorAll('button')].map((button) => button.innerText.trim());
      const trace = {
        title: 'Способ подписания',
        buttons,
        location: window.location.href
      };
      logConsole('React sign modal detected', trace);
      emit({
        kind: 'function',
        method: 'DETECTED',
        url: 'react-sign-method-modal',
        requestBody: null,
        status: 0,
        responseText: safeJson(trace)
      });
    }

    const container = modal.querySelector('[class*="SelectMethodModal_container"]') || modal;
    if (container.querySelector('.esf-bio-sign-debug-button')) {
      return;
    }

    const sourceButton = [...container.querySelectorAll('button')]
      .find((button) => button.innerText.includes('Подписать с помощью ЭЦП'));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${sourceButton?.className || ''} esf-bio-sign-debug-button`.trim();
    button.textContent = 'Подписать через биометрию';
    button.style.background = '#006196';
    button.style.borderColor = '#006196';
    button.style.color = '#fff';

    button.addEventListener('click', () => {
      const trace = {
        title: 'Подписать через биометрию',
        location: window.location.href,
        note: 'debug button clicked; native raw document signing is not wired yet'
      };
      logConsole('React bio sign button CLICK', trace);
      emit({
        kind: 'function',
        method: 'CLICK',
        url: 'react-bio-sign-button',
        requestBody: null,
        status: 0,
        responseText: safeJson(trace)
      });
    });

    container.append(button);
    logConsole('React bio sign debug button injected', { location: window.location.href });
  };

  const installFunctionHooks = () => {
    if (window.signHashRequest && !window.signHashRequest.__esfBioDebugWrapped) {
      const originalSignHashRequest = window.signHashRequest;
      window.signHashRequest = function patchedSignHashRequest(data, callback, options, docType) {
        const summary = {
          docType: docType || null,
          payload: summarizeSignPayload(data),
          hasCallback: typeof callback === 'function',
          optionKeys: options && typeof options === 'object' ? Object.keys(options) : []
        };

        logConsole('signHashRequest CALL', summary);
        emit({
          kind: 'function',
          method: 'CALL',
          url: 'signHashRequest',
          requestBody: safeJson(summary),
          status: 0,
          responseText: safeJson(data)
        });

        const wrappedCallback = typeof callback === 'function'
          ? function debugSignHashRequestCallback(certificate, signature, cert) {
            const callbackSummary = {
              docType: docType || null,
              certificateLength: certificate ? String(certificate).length : 0,
              signatureType: Array.isArray(signature) ? 'array' : typeof signature,
              signatureKeys: signature && typeof signature === 'object' ? Object.keys(signature) : [],
              signatureLength: typeof signature === 'string' ? signature.length : 0,
              certKeys: cert && typeof cert === 'object' ? Object.keys(cert) : []
            };
            logConsole('signHashRequest CALLBACK', callbackSummary);
            emit({
              kind: 'function',
              method: 'CALLBACK',
              url: 'signHashRequest',
              requestBody: null,
              status: 0,
              responseText: safeJson(callbackSummary)
            });
            return callback.apply(this, arguments);
          }
          : callback;

        return originalSignHashRequest.call(this, data, wrappedCallback, options, docType);
      };
      window.signHashRequest.__esfBioDebugWrapped = true;
      logConsole('hook installed', 'signHashRequest');
    }

    if (window.tumAdapter?.getSignature && !window.tumAdapter.getSignature.__esfBioDebugWrapped) {
      const originalGetSignature = window.tumAdapter.getSignature;
      window.tumAdapter.getSignature = function patchedGetSignature(data, callback) {
        const summary = summarizeSignPayload(data);
        logConsole('tumAdapter.getSignature CALL', summary);
        emit({
          kind: 'function',
          method: 'CALL',
          url: 'tumAdapter.getSignature',
          requestBody: safeJson(summary),
          status: 0,
          responseText: safeJson(data)
        });

        const wrappedCallback = typeof callback === 'function'
          ? function debugGetSignatureCallback(cert, sign) {
            const callbackSummary = {
              certKeys: cert && typeof cert === 'object' ? Object.keys(cert) : [],
              signType: Array.isArray(sign) ? 'array' : typeof sign,
              signKeys: sign && typeof sign === 'object' ? Object.keys(sign) : [],
              signLength: typeof sign === 'string' ? sign.length : 0
            };
            logConsole('tumAdapter.getSignature CALLBACK', callbackSummary);
            emit({
              kind: 'function',
              method: 'CALLBACK',
              url: 'tumAdapter.getSignature',
              requestBody: null,
              status: 0,
              responseText: safeJson(callbackSummary)
            });
            return callback.apply(this, arguments);
          }
          : callback;

        return originalGetSignature.call(this, data, wrappedCallback);
      };
      window.tumAdapter.getSignature.__esfBioDebugWrapped = true;
      logConsole('hook installed', 'tumAdapter.getSignature');
    }

    if (window.tumAdapter?.signRequest && !window.tumAdapter.signRequest.__esfBioDebugWrapped) {
      const originalSignRequest = window.tumAdapter.signRequest;
      window.tumAdapter.signRequest = function patchedSignRequest(data, format, type, callback) {
        logConsole('tumAdapter.signRequest CALL', { format, type, payload: summarizeSignPayload(data) });
        emit({
          kind: 'function',
          method: 'CALL',
          url: 'tumAdapter.signRequest',
          requestBody: safeJson({ data, format, type }),
          status: 0,
          responseText: null
        });

        const wrappedCallback = typeof callback === 'function'
          ? function debugSignRequestCallback(result) {
            logConsole('tumAdapter.signRequest CALLBACK', result);
            emit({
              kind: 'function',
              method: 'CALLBACK',
              url: 'tumAdapter.signRequest',
              requestBody: null,
              status: 0,
              responseText: safeJson(result)
            });
            return callback.apply(this, arguments);
          }
          : callback;

        return originalSignRequest.call(this, data, format, type, wrappedCallback);
      };
      window.tumAdapter.signRequest.__esfBioDebugWrapped = true;
    }

    if (window.selectSignMethod && !window.selectSignMethod.__esfBioDebugWrapped) {
      const originalSelectSignMethod = window.selectSignMethod;
      window.selectSignMethod = function patchedSelectSignMethod(login, callback) {
        logConsole('selectSignMethod CALL', { login });
        emit({
          kind: 'function',
          method: 'CALL',
          url: 'selectSignMethod',
          requestBody: safeJson({ login }),
          status: 0,
          responseText: null
        });

        const wrappedCallback = typeof callback === 'function'
          ? function debugSelectSignMethodCallback(method) {
            logConsole('selectSignMethod CALLBACK', { method });
            emit({
              kind: 'function',
              method: 'CALLBACK',
              url: 'selectSignMethod',
              requestBody: null,
              status: 0,
              responseText: safeJson({ method })
            });
            return callback.apply(this, arguments);
          }
          : callback;

        return originalSelectSignMethod.call(this, login, wrappedCallback);
      };
      window.selectSignMethod.__esfBioDebugWrapped = true;
    }

    if (window.getQRSignSignature && !window.getQRSignSignature.__esfBioDebugWrapped) {
      const originalGetQRSignSignature = window.getQRSignSignature;
      window.getQRSignSignature = function patchedGetQRSignSignature(data, docType) {
        logConsole('getQRSignSignature CALL', { docType, payload: summarizeSignPayload(data) });
        emit({
          kind: 'function',
          method: 'CALL',
          url: 'getQRSignSignature',
          requestBody: safeJson({ data, docType }),
          status: 0,
          responseText: null
        });

        return Promise.resolve(originalGetQRSignSignature.apply(this, arguments)).then((result) => {
          logConsole('getQRSignSignature RESOLVE', result);
          emit({
            kind: 'function',
            method: 'RESOLVE',
            url: 'getQRSignSignature',
            requestBody: null,
            status: 0,
            responseText: safeJson(result)
          });
          return result;
        });
      };
      window.getQRSignSignature.__esfBioDebugWrapped = true;
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init = {}) {
    const startedAt = Date.now();
    let method = init?.method || 'GET';
    let url = '';
    let requestHeaders = {};
    let requestBody = null;

    try {
      if (input instanceof Request) {
        url = input.url;
        method = init?.method || input.method || method;
        requestHeaders = headersToObject(init?.headers ? new Headers(init.headers) : input.headers);
        requestBody = init?.body != null
          ? await bodyToText(init.body)
          : await input.clone().text().then(truncate).catch(() => null);
      } else {
        url = String(input);
        requestHeaders = headersToObject(init?.headers ? new Headers(init.headers) : null);
        requestBody = await bodyToText(init?.body);
      }
    } catch (error) {
      requestBody = `[request capture failed: ${error.message}]`;
    }

    try {
      const response = await originalFetch.apply(this, arguments);
      let responseText = null;
      try {
        responseText = await response.clone().text();
      } catch (error) {
        responseText = `[response capture failed: ${error.message}]`;
      }
      emit({
        kind: 'fetch',
        method,
        url,
        requestHeaders,
        requestBody,
        status: response.status,
        ok: response.ok,
        responseHeaders: headersToObject(response.headers),
        responseText: truncate(responseText),
        durationMs: Date.now() - startedAt
      });
      return response;
    } catch (error) {
      emit({
        kind: 'fetch',
        method,
        url,
        requestHeaders,
        requestBody,
        error: error.message,
        durationMs: Date.now() - startedAt
      });
      throw error;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__esfBioDebug = {
      method,
      url: String(url),
      startedAt: 0,
      requestBody: null
    };
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const debug = this.__esfBioDebug || {};
    debug.startedAt = Date.now();
    bodyToText(body)
      .then((text) => {
        debug.requestBody = text;
      })
      .catch((error) => {
        debug.requestBody = `[request capture failed: ${error.message}]`;
      });

    this.addEventListener('loadend', () => {
      let responseText = null;
      try {
        responseText = this.responseType && this.responseType !== 'text'
          ? `[responseType=${this.responseType}]`
          : this.responseText;
      } catch (error) {
        responseText = `[response capture failed: ${error.message}]`;
      }

      emit({
        kind: 'xhr',
        method: debug.method || 'GET',
        url: debug.url || '',
        requestBody: debug.requestBody,
        status: this.status,
        responseText: truncate(responseText),
        durationMs: debug.startedAt ? Date.now() - debug.startedAt : null
      });
    });

    return originalSend.apply(this, arguments);
  };

  emit({
    kind: 'debug-installed',
    method: 'TRACE',
    url: window.location.href,
    status: 0,
    responseText: 'ESF Bio Auth network debug installed'
  });
  logConsole('installed', 'network/signing debug hooks are active');

  installFunctionHooks();
  ensureReactSignMethodTrace();
  window.setInterval(installFunctionHooks, 500);
  window.setInterval(ensureReactSignMethodTrace, 500);
})();
