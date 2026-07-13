'use strict';

const { getMediaBucket, getSupabaseAnonKey, getSupabaseServiceKey, getSupabaseUrl } = require('./env');
const { HttpError } = require('./http');

class UpstreamError extends Error {
  constructor(service, status, message) {
    super(message || `${service} request failed`);
    this.name = 'UpstreamError';
    this.service = service;
    this.status = status;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function supabaseRequest(path, options = {}) {
  const service = options.service === true;
  const apiKey = service ? getSupabaseServiceKey() : getSupabaseAnonKey();
  const authorization = options.accessToken || apiKey;
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${authorization}`,
    ...(options.headers || {}),
  };
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetchWithTimeout(`${getSupabaseUrl()}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  }, options.timeoutMs || 12000);
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (_error) { payload = text; }
  }
  if (!response.ok) {
    const upstreamMessage = payload && typeof payload === 'object' && (payload.message || payload.error_description || payload.msg);
    throw new UpstreamError('Supabase', response.status, upstreamMessage || 'Supabase request failed.');
  }
  return payload;
}

async function getStoreRow() {
  const params = new URLSearchParams({ id: 'eq.store', select: 'id,data,updated_at', limit: '1' });
  const rows = await supabaseRequest(`/rest/v1/shadowgbl_store?${params}`, { service: true });
  if (!Array.isArray(rows) || !rows[0]) throw new HttpError(503, 'The store is temporarily unavailable.', 'store_unavailable');
  return rows[0];
}

async function updateStoreRow(data, expectedUpdatedAt, nextUpdatedAt) {
  const params = new URLSearchParams({
    id: 'eq.store',
    updated_at: expectedUpdatedAt == null ? 'is.null' : `eq.${expectedUpdatedAt}`,
    select: 'id,data,updated_at',
  });
  const rows = await supabaseRequest(`/rest/v1/shadowgbl_store?${params}`, {
    service: true,
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    json: { data, updated_at: nextUpdatedAt },
  });
  if (!Array.isArray(rows) || !rows[0]) throw new HttpError(409, 'The store changed since it was opened. Reload and try again.', 'store_conflict');
  return rows[0];
}

async function insertOrderOnce(order) {
  const params = new URLSearchParams({ on_conflict: 'stripe_session_id' });
  const rows = await supabaseRequest(`/rest/v1/shadowgbl_orders?${params}`, {
    service: true,
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    json: order,
  });
  return { inserted: Array.isArray(rows) && rows.length > 0, row: Array.isArray(rows) ? rows[0] || null : null };
}

async function markDeliveryEmailSent(stripeSessionId, sentAt) {
  const params = new URLSearchParams({ stripe_session_id: `eq.${stripeSessionId}` });
  await supabaseRequest(`/rest/v1/shadowgbl_orders?${params}`, {
    service: true,
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    json: { delivery_email_sent_at: sentAt, updated_at: sentAt },
  });
}

async function listOrders(limit, offset) {
  const params = new URLSearchParams({
    select: 'id,stripe_session_id,stripe_payment_intent_id,stripe_event_id,product_id,product_name,buyer_email,amount_total,currency,status,delivery_link,delivery_email_sent_at,created_at,updated_at',
    order: 'created_at.desc',
    limit: String(limit),
    offset: String(offset),
  });
  const rows = await supabaseRequest(`/rest/v1/shadowgbl_orders?${params}`, { service: true });
  return Array.isArray(rows) ? rows : [];
}

function encodeStoragePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

async function uploadMediaObject(path, buffer, contentType) {
  const bucket = getMediaBucket();
  await supabaseRequest(`/storage/v1/object/${bucket}/${encodeStoragePath(path)}`, {
    service: true,
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-upsert': 'false',
      'Cache-Control': '31536000',
    },
    body: buffer,
    timeoutMs: 30000,
  });
  return `${getSupabaseUrl()}/storage/v1/object/public/${bucket}/${encodeStoragePath(path)}`;
}

async function createSignedMediaUpload(path) {
  const bucket = getMediaBucket();
  const encodedPath = encodeStoragePath(path);
  const payload = await supabaseRequest(`/storage/v1/object/upload/sign/${bucket}/${encodedPath}`, {
    service: true,
    method: 'POST',
    json: {},
  });
  if (!payload || typeof payload.token !== 'string') {
    throw new UpstreamError('Supabase', 502, 'Supabase did not create an upload token.');
  }
  const signedPath = typeof payload.url === 'string'
    ? payload.url
    : `/storage/v1/object/upload/sign/${bucket}/${encodedPath}?token=${encodeURIComponent(payload.token)}`;
  let signedUrl;
  if (/^https?:\/\//i.test(signedPath)) signedUrl = signedPath;
  else if (signedPath.startsWith('/storage/v1/')) signedUrl = `${getSupabaseUrl()}${signedPath}`;
  else if (signedPath.startsWith('/object/')) signedUrl = `${getSupabaseUrl()}/storage/v1${signedPath}`;
  else signedUrl = `${getSupabaseUrl()}/storage/v1/${signedPath.replace(/^\//, '')}`;
  return {
    token: payload.token,
    signedUrl,
    publicUrl: `${getSupabaseUrl()}/storage/v1/object/public/${bucket}/${encodedPath}`,
  };
}

module.exports = {
  UpstreamError,
  createSignedMediaUpload,
  fetchWithTimeout,
  getStoreRow,
  insertOrderOnce,
  listOrders,
  markDeliveryEmailSent,
  supabaseRequest,
  updateStoreRow,
  uploadMediaObject,
};
