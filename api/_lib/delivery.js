'use strict';

const { HttpError } = require('./http');

const PROTECTED_DOWNLOAD_PREFIX = '/api/download/';

function parseHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url : null;
  } catch (_error) {
    return null;
  }
}

function isProtectedDeliveryUrl(value) {
  const url = parseHttpsUrl(value);
  return Boolean(url && url.pathname.startsWith(PROTECTED_DOWNLOAD_PREFIX));
}

function deliveryUrlForPaidSession(value, sessionId) {
  const url = parseHttpsUrl(value);
  if (!url) return null;
  if (!url.pathname.startsWith(PROTECTED_DOWNLOAD_PREFIX)) return url.toString();
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpError(500, 'A paid session is required for protected delivery.', 'delivery_session_missing');
  }
  url.searchParams.set('session_id', sessionId);
  return url.toString();
}

function assertProtectedProductRoute(value, expectedPath) {
  const url = parseHttpsUrl(value);
  if (!url || url.pathname !== expectedPath) {
    throw new HttpError(403, 'This purchase does not unlock the requested product.', 'delivery_not_authorized');
  }
  return url;
}

module.exports = {
  assertProtectedProductRoute,
  deliveryUrlForPaidSession,
  isProtectedDeliveryUrl,
  parseHttpsUrl,
};
