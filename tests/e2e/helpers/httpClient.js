"use strict";

/**
 * PUBLIC_INTERFACE
 * Minimal HTTP JSON client for E2E tests with timeout support.
 *
 * @param {string} url
 * @param {{method: string, body?: any, headers?: Record<string,string>, timeoutMs?: number}} opts
 * @returns {Promise<{status: number, headers: Record<string,string>, body: any}>}
 */
async function httpJson(url, opts) {
  const method = opts.method || "GET";
  const timeoutMs = opts.timeoutMs || 5000;

  const headers = {
    "content-type": "application/json",
    ...(opts.headers || {}),
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const outHeaders = {};
    for (const [k, v] of res.headers.entries()) outHeaders[k.toLowerCase()] = v;

    let body = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (_) {
        body = text;
      }
    }

    return { status: res.status, headers: outHeaders, body };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { httpJson };
