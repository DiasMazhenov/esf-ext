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

  const installFunctionHooks = () => {
    if (window.tumAdapter?.signRequest && !window.tumAdapter.signRequest.__esfBioDebugWrapped) {
      const originalSignRequest = window.tumAdapter.signRequest;
      window.tumAdapter.signRequest = function patchedSignRequest(data, format, type, callback) {
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
        emit({
          kind: 'function',
          method: 'CALL',
          url: 'getQRSignSignature',
          requestBody: safeJson({ data, docType }),
          status: 0,
          responseText: null
        });

        return Promise.resolve(originalGetQRSignSignature.apply(this, arguments)).then((result) => {
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

  installFunctionHooks();
  window.setInterval(installFunctionHooks, 500);
})();
