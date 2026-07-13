'use strict';

const DEFAULT_BODY_LIMIT = 1024 * 1024;

class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code || 'request_error';
    this.details = details;
  }
}

function header(req, name) {
  const value = req && req.headers && req.headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value.join(',') : value;
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
}

function sendJson(res, status, body) {
  setSecurityHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'internal_error';
  const message = error instanceof HttpError ? error.message : 'An unexpected server error occurred.';
  const body = { error: { code, message } };
  if (error instanceof HttpError && error.details !== undefined) body.error.details = error.details;
  sendJson(res, status, body);
}

function allowMethods(req, allowed) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!allowed.includes(method)) {
    throw new HttpError(405, 'Method not allowed.', 'method_not_allowed', { allowed });
  }
  return method;
}

async function readRawBody(req, limit = DEFAULT_BODY_LIMIT) {
  if (Buffer.isBuffer(req.rawBody)) {
    if (req.rawBody.length > limit) throw new HttpError(413, 'Request body is too large.', 'body_too_large');
    return req.rawBody;
  }
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limit) throw new HttpError(413, 'Request body is too large.', 'body_too_large');
    return req.body;
  }
  if (typeof req.body === 'string') {
    const buffer = Buffer.from(req.body, 'utf8');
    if (buffer.length > limit) throw new HttpError(413, 'Request body is too large.', 'body_too_large');
    return buffer;
  }
  // Some local test harnesses provide an already-parsed body. This path must
  // never be used for Stripe signature verification in production.
  if (req.body && typeof req.body === 'object' && typeof req.on !== 'function') {
    const buffer = Buffer.from(JSON.stringify(req.body), 'utf8');
    if (buffer.length > limit) throw new HttpError(413, 'Request body is too large.', 'body_too_large');
    return buffer;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, 'Request body is too large.', 'body_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit = DEFAULT_BODY_LIMIT) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req, limit);
  if (!raw.length) throw new HttpError(400, 'A JSON request body is required.', 'missing_body');
  try {
    const value = JSON.parse(raw.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch (_error) {
    throw new HttpError(400, 'The request body must be valid JSON.', 'invalid_json');
  }
}

function queryParam(req, key) {
  if (req.query && req.query[key] !== undefined) {
    const value = req.query[key];
    return Array.isArray(value) ? value[0] : value;
  }
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams.get(key);
  } catch (_error) {
    return null;
  }
}

function requestOrigin(req) {
  const proto = header(req, 'x-forwarded-proto') || (req.socket && req.socket.encrypted ? 'https' : 'http');
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  return host ? `${String(proto).split(',')[0]}://${String(host).split(',')[0]}` : null;
}

function assertSameOrigin(req) {
  const origin = header(req, 'origin');
  if (!origin) return;
  const ownOrigin = requestOrigin(req);
  if (!ownOrigin || origin !== ownOrigin) {
    throw new HttpError(403, 'Cross-site admin requests are not allowed.', 'invalid_origin');
  }
}

module.exports = {
  DEFAULT_BODY_LIMIT,
  HttpError,
  allowMethods,
  assertSameOrigin,
  header,
  queryParam,
  readJson,
  readRawBody,
  requestOrigin,
  sendError,
  sendJson,
  setSecurityHeaders,
};
