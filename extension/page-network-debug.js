(function () {
  const EVENT_TYPE = 'ESF_BIO_NETWORK_DEBUG_EVENT';
  const RAW_SIGN_REQUEST_TYPE = 'ESF_BIO_RAW_SIGN_REQUEST';
  const RAW_SIGN_RESPONSE_TYPE = 'ESF_BIO_RAW_SIGN_RESPONSE';
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

  const summarizeXml = (value) => {
    const text = value == null ? '' : String(value);
    const rootMatch = text.match(/<([a-zA-Z0-9_-]+:)?([a-zA-Z0-9_-]+)/);
    const numberMatch = text.match(/<num>([^<]+)<\/num>/);
    const dateMatch = text.match(/<date>([^<]+)<\/date>/);
    const invoiceTypeMatch = text.match(/<invoiceType>([^<]+)<\/invoiceType>/);
    return {
      root: rootMatch ? rootMatch[2] : null,
      length: text.length,
      num: numberMatch ? numberMatch[1] : null,
      date: dateMatch ? dateMatch[1] : null,
      invoiceType: invoiceTypeMatch ? invoiceTypeMatch[1] : null,
      preview: truncate(text.slice(0, 500))
    };
  };

  const rememberPossibleHashResponse = (entry) => {
    if (!String(entry.url || '').includes('/invoice/hash') && !String(entry.url || '').includes('/awp/hash')) {
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(entry.responseText);
    } catch {
      return;
    }

    if (!parsed?.hash) {
      return;
    }

    window.__esfBioLastDocumentHash = {
      capturedAt: new Date().toISOString(),
      url: entry.url,
      requestBody: entry.requestBody,
      hash: parsed.hash,
      hashSummary: summarizeXml(parsed.hash)
    };

    logConsole('document hash captured', window.__esfBioLastDocumentHash.hashSummary);
    emit({
      kind: 'function',
      method: 'CAPTURED',
      url: 'document-hash',
      requestBody: truncate(entry.requestBody),
      status: entry.status || 0,
      responseText: safeJson(window.__esfBioLastDocumentHash.hashSummary)
    });
  };

  const parseCapturedFormData = (requestBody) => {
    if (!requestBody) {
      return null;
    }

    try {
      const entries = JSON.parse(requestBody);
      if (!Array.isArray(entries)) {
        return null;
      }

      return entries.reduce((acc, entry) => {
        if (Array.isArray(entry) && entry.length >= 2) {
          acc[entry[0]] = entry[1];
        }
        return acc;
      }, {});
    } catch {
      return null;
    }
  };

  const summarizeSubmitRequest = (entry) => {
    const url = String(entry.url || '');
    const isTrackedSubmit = [
      '/invoice/create',
      '/invoice/sendSignedDrafts',
      '/invoice/sendSignedImported',
      '/awp/create',
      '/awp/sendSignedDrafts',
      '/awp/sendSignedImported'
    ].some((path) => url.includes(path));

    if (!isTrackedSubmit) {
      return;
    }

    const formData = parseCapturedFormData(entry.requestBody);
    const summary = {
      url,
      status: entry.status || 0,
      formKeys: formData ? Object.keys(formData) : [],
      hasCertificate: Boolean(formData?.certificate || String(entry.requestBody || '').includes('certificate')),
      hasSignature: Boolean(formData?.signature || formData?.signatures || String(entry.requestBody || '').includes('signature')),
      certificateLength: formData?.certificate ? String(formData.certificate).length : 0,
      signatureLength: formData?.signature ? String(formData.signature).length : 0,
      signaturesLength: formData?.signatures ? String(formData.signatures).length : 0,
      invoiceInfoLength: formData?.invoiceInfo ? String(formData.invoiceInfo).length : 0,
      awpActionInfosLength: formData?.awpActionInfos ? String(formData.awpActionInfos).length : 0,
      requestBody: truncate(entry.requestBody),
      responsePreview: truncate(String(entry.responseText || '').slice(0, 2000))
    };

    window.__esfBioLastSubmitTrace = {
      capturedAt: new Date().toISOString(),
      ...summary
    };

    logConsole('signed submit request captured', summary);
    emit({
      kind: 'function',
      method: 'CAPTURED',
      url: 'signed-submit-request',
      requestBody: truncate(entry.requestBody),
      status: entry.status || 0,
      responseText: safeJson(summary)
    });
  };

  const deriveSubmitUrlFromHashUrl = (hashUrl) => {
    const url = String(hashUrl || '');
    if (url.includes('/invoice/hash')) {
      return url.replace('/invoice/hash', '/invoice/create');
    }
    if (url.includes('/awp/hash')) {
      return url.replace('/awp/hash', '/awp/create');
    }
    return null;
  };

  const buildSubmitCandidate = (signed) => {
    const lastHash = window.__esfBioLastDocumentHash;
    const formData = parseCapturedFormData(lastHash?.requestBody);
    const submitUrl = deriveSubmitUrlFromHashUrl(lastHash?.url);

    if (!formData || !submitUrl) {
      return null;
    }

    const fields = {
      ...formData,
      certificate: signed.certificate || '',
      signature: signed.signature || ''
    };

    return {
      capturedAt: new Date().toISOString(),
      submitUrl,
      fields,
      summary: {
        submitUrl,
        formKeys: Object.keys(fields),
        sourceHashUrl: lastHash.url,
        sourceHashFormKeys: Object.keys(formData),
        certificateLength: fields.certificate.length,
        signatureLength: fields.signature.length,
        invoiceLength: fields.invoice ? String(fields.invoice).length : 0,
        version: fields.version || null
      }
    };
  };

  const describeElement = (element) => {
    if (!element || !(element instanceof HTMLElement)) {
      return null;
    }

    return {
      tag: element.tagName.toLowerCase(),
      text: truncate((element.innerText || element.textContent || '').trim()),
      className: String(element.className || ''),
      id: element.id || null,
      type: element.getAttribute('type')
    };
  };

  const traceSignButtonClick = (event) => {
    const button = event.target?.closest?.('button, a');
    if (!button) {
      return;
    }

    const text = (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim();
    const isSignButton = text.includes('Подписать с помощью ЭЦП') ||
      text.includes('Подписать с помощью QR') ||
      text.includes('Подписать через биометрию');
    if (!isSignButton) {
      return;
    }

    const trace = {
      button: describeElement(button),
      modal: describeElement(button.closest('[role="dialog"], .ReactModal__Content, .ui-dialog')),
      lastDocumentHash: window.__esfBioLastDocumentHash?.hashSummary || null,
      location: window.location.href
    };

    logConsole('sign method button CLICK', trace);
    emit({
      kind: 'function',
      method: 'CLICK',
      url: 'sign-method-button',
      requestBody: null,
      status: 0,
      responseText: safeJson(trace)
    });
  };

  const requestRawSign = (rawData) => new Promise((resolve, reject) => {
    const requestId = `raw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      reject(new Error('Native raw-sign не ответил за 60 секунд.'));
    }, 60000);

    function handleResponse(event) {
      if (event.source !== window || event.data?.type !== RAW_SIGN_RESPONSE_TYPE || event.data.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timer);
      window.removeEventListener('message', handleResponse);

      if (!event.data.ok) {
        reject(new Error(event.data.error || 'Raw подпись не получена.'));
        return;
      }

      resolve(event.data);
    }

    window.addEventListener('message', handleResponse);
    window.postMessage({
      type: RAW_SIGN_REQUEST_TYPE,
      requestId,
      rawData
    }, window.location.origin);
  });

  const formatPemCertificate = (certificate) => {
    const compact = String(certificate || '')
      .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, '');
    if (!compact) {
      return '';
    }
    const lines = compact.match(/.{1,64}/g) || [compact];
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
  };

  const installBioNcaLayerWebSocket = () => {
    if (window.__esfBioNcaLayerWebSocketInstalled) {
      return;
    }

    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket !== 'function') {
      return;
    }

    const dispatchAsync = (target, type, detail = {}) => {
      window.setTimeout(() => {
        const event = {
          type,
          target,
          currentTarget: target,
          ...detail
        };
        const listeners = target.__listeners?.[type] || [];
        listeners.forEach((listener) => {
          try {
            listener.call(target, event);
          } catch (error) {
            logConsole('fake NCALayer listener ERROR', error.message);
          }
        });
        const handler = target[`on${type}`];
        if (typeof handler === 'function') {
          try {
            handler.call(target, event);
          } catch (error) {
            logConsole('fake NCALayer handler ERROR', error.message);
          }
        }
      }, 0);
    };

    class BioNcaLayerWebSocket {
      constructor(url) {
        this.url = String(url || '');
        this.readyState = NativeWebSocket.OPEN;
        this.bufferedAmount = 0;
        this.extensions = '';
        this.protocol = '';
        this.binaryType = 'blob';
        this.__listeners = {};
        dispatchAsync(this, 'open');
      }

      addEventListener(type, listener) {
        if (typeof listener !== 'function') {
          return;
        }
        if (!this.__listeners[type]) {
          this.__listeners[type] = [];
        }
        this.__listeners[type].push(listener);
      }

      removeEventListener(type, listener) {
        this.__listeners[type] = (this.__listeners[type] || []).filter((item) => item !== listener);
      }

      dispatchEvent(event) {
        dispatchAsync(this, event?.type || 'message', event || {});
        return true;
      }

      send(payload) {
        let request = null;
        try {
          request = JSON.parse(String(payload || '{}'));
        } catch {
          this.respond({ status: false, code: 'invalid-json' });
          return;
        }

        logConsole('fake NCALayer request', {
          module: request.module || null,
          method: request.method || null,
          format: request.args?.format || null,
          dataType: Array.isArray(request.args?.data) ? 'array' : typeof request.args?.data
        });

        if (request.method === 'getBundles') {
          this.respond({ result: { version: '1.4' } });
          return;
        }

        if (request.method === 'sign') {
          this.signRawPayload(request.args?.data);
          return;
        }

        this.respond({ status: false, code: `unsupported-method:${request.method || 'unknown'}` });
      }

      async signRawPayload(data) {
        const payloads = Array.isArray(data) ? data : [data];
        try {
          const signedItems = [];
          for (const item of payloads) {
            signedItems.push(await requestRawSign(String(item || '')));
          }

          const first = signedItems[0] || {};
          const result = {
            certificate: formatPemCertificate(first.certificate || ''),
            signatures: signedItems.map((item) => item.signature || '')
          };

          window.__esfBioFakeNcaLastResult = {
            capturedAt: new Date().toISOString(),
            payloadCount: payloads.length,
            certificateLength: first.certificate ? String(first.certificate).length : 0,
            signatureLengths: result.signatures.map((signature) => String(signature || '').length),
            diagnostics: first.diagnostics || null,
            lastDocumentHash: window.__esfBioLastDocumentHash?.hashSummary || null
          };

          logConsole('fake NCALayer sign RESULT', window.__esfBioFakeNcaLastResult);
          emit({
            kind: 'function',
            method: 'RESULT',
            url: 'fake-ncalayer-sign',
            requestBody: safeJson(window.__esfBioLastDocumentHash?.hashSummary || null),
            status: 0,
            responseText: safeJson(window.__esfBioFakeNcaLastResult)
          });

          this.respond({
            status: true,
            body: { result }
          });
        } catch (error) {
          logConsole('fake NCALayer sign ERROR', error.message);
          this.respond({
            status: false,
            code: error.message || 'bio-sign-failed'
          });
        }
      }

      respond(response) {
        dispatchAsync(this, 'message', {
          data: JSON.stringify(response)
        });
      }

      close() {
        this.readyState = NativeWebSocket.CLOSED;
        dispatchAsync(this, 'close');
      }
    }

    window.WebSocket = function EsfBioPatchedWebSocket(url, protocols) {
      const targetUrl = String(url || '');
      if (window.__esfBioFakeNcaActive && (targetUrl.includes('127.0.0.1:13579') || targetUrl.includes('localhost:13579'))) {
        logConsole('fake NCALayer WebSocket opened', targetUrl);
        return new BioNcaLayerWebSocket(targetUrl);
      }

      return protocols == null
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);
    };

    Object.defineProperties(window.WebSocket, {
      CONNECTING: { value: NativeWebSocket.CONNECTING },
      OPEN: { value: NativeWebSocket.OPEN },
      CLOSING: { value: NativeWebSocket.CLOSING },
      CLOSED: { value: NativeWebSocket.CLOSED }
    });
    window.WebSocket.prototype = NativeWebSocket.prototype;
    window.__esfBioNcaLayerWebSocketInstalled = true;
    logConsole('fake NCALayer WebSocket hook installed', 'short-lived bio signing mode');
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
        lastDocumentHash: window.__esfBioLastDocumentHash?.hashSummary || null,
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

    button.addEventListener('click', async () => {
      const trace = {
        title: 'Подписать через биометрию',
        location: window.location.href,
        lastDocumentHash: window.__esfBioLastDocumentHash?.hashSummary || null,
        note: 'delegating to official ESF ECP flow with biometric NCALayer-compatible signature'
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

      if (!window.__esfBioLastDocumentHash?.hash) {
        const error = 'Нет последнего XML из /invoice/hash или /awp/hash.';
        logConsole('React bio sign ERROR', error);
        emit({
          kind: 'function',
          method: 'ERROR',
          url: 'react-bio-sign-button',
          requestBody: null,
          status: 0,
          responseText: error
        });
        return;
      }

      if (!sourceButton) {
        const error = 'Не найдена штатная кнопка "Подписать с помощью ЭЦП".';
        logConsole('React bio sign ERROR', error);
        emit({
          kind: 'function',
          method: 'ERROR',
          url: 'react-bio-sign-button',
          requestBody: null,
          status: 0,
          responseText: error
        });
        return;
      }

      button.disabled = true;
      const previousText = button.textContent;
      button.textContent = 'Передаю в ESF...';
      try {
        window.__esfBioFakeNcaActive = true;
        window.clearTimeout(window.__esfBioFakeNcaActiveTimer);
        window.__esfBioFakeNcaActiveTimer = window.setTimeout(() => {
          window.__esfBioFakeNcaActive = false;
        }, 120000);

        const candidate = buildSubmitCandidate({
          certificate: '',
          signature: ''
        });
        window.__esfBioLastSubmitCandidate = candidate;

        const result = {
          mode: 'official-esf-flow',
          fakeNcaActive: true,
          nativeButton: describeElement(sourceButton),
          lastDocumentHash: window.__esfBioLastDocumentHash.hashSummary,
          submitCandidate: candidate?.summary || null
        };
        logConsole('React bio sign DELEGATED', result);
        emit({
          kind: 'function',
          method: 'DELEGATED',
          url: 'react-bio-sign-button',
          requestBody: safeJson(window.__esfBioLastDocumentHash.hashSummary),
          status: 0,
          responseText: safeJson(result)
        });

        sourceButton.click();
        button.textContent = 'Ожидаю ESF...';
      } catch (error) {
        logConsole('React bio sign ERROR', error.result || error.message);
        emit({
          kind: 'function',
          method: 'ERROR',
          url: 'react-bio-sign-button',
          requestBody: safeJson(window.__esfBioLastDocumentHash.hashSummary),
          status: 0,
          responseText: safeJson(error.result || error.message)
        });
        button.textContent = 'Ошибка подписи';
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = previousText;
        }, 4000);
      }
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
      rememberPossibleHashResponse({
        url,
        requestBody,
        responseText,
        status: response.status
      });
      summarizeSubmitRequest({
        url,
        requestBody,
        responseText,
        status: response.status
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
    debug.requestBodyPromise = bodyToText(body)
      .then((text) => {
        debug.requestBody = text;
        debug.requestBodyReady = true;
        return text;
      })
      .catch((error) => {
        debug.requestBody = `[request capture failed: ${error.message}]`;
        debug.requestBodyReady = true;
        return debug.requestBody;
      });

    this.addEventListener('loadend', async () => {
      if (debug.requestBodyPromise && !debug.requestBodyReady) {
        await debug.requestBodyPromise;
      }

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
      rememberPossibleHashResponse({
        url: debug.url || '',
        requestBody: debug.requestBody,
        responseText,
        status: this.status
      });
      summarizeSubmitRequest({
        url: debug.url || '',
        requestBody: debug.requestBody,
        responseText,
        status: this.status
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

  installBioNcaLayerWebSocket();
  installFunctionHooks();
  ensureReactSignMethodTrace();
  document.addEventListener('click', traceSignButtonClick, true);
  window.setInterval(installFunctionHooks, 500);
  window.setInterval(ensureReactSignMethodTrace, 500);
})();
