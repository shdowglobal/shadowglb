'use strict';

const { HttpError, requestOrigin } = require('./http');

function readEnv(names, options = {}) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (options.required !== false) {
    throw new HttpError(500, 'A required server configuration value is missing.', 'server_misconfigured');
  }
  return null;
}

function getSupabaseUrl() {
  const value = readEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('https required');
    return url.toString().replace(/\/$/, '');
  } catch (_error) {
    throw new HttpError(500, 'The Supabase URL is invalid.', 'server_misconfigured');
  }
}

function getSupabaseAnonKey() {
  return readEnv(['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
}

function getSupabaseServiceKey() {
  return readEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function getStripeSecretKey() {
  return readEnv('STRIPE_SECRET_KEY');
}

function getStripeWebhookSecret() {
  return readEnv('STRIPE_WEBHOOK_SECRET');
}

function normalizeSiteUrl(value) {
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('secure URL required');
  return url.origin;
}

function getSiteUrl(req) {
  const vercelEnvironment = readEnv('VERCEL_ENV', { required: false });
  let configured;
  if (vercelEnvironment && vercelEnvironment !== 'production') {
    configured = readEnv('VERCEL_URL', { required: false });
    if (!configured) throw new HttpError(500, 'VERCEL_URL must be configured for preview checkout.', 'server_misconfigured');
  } else {
    configured = readEnv(['SITE_URL', 'VERCEL_URL'], { required: false });
  }
  if (configured) {
    try {
      return normalizeSiteUrl(configured);
    } catch (_error) {
      throw new HttpError(500, 'The site URL is invalid.', 'server_misconfigured');
    }
  }
  // Host fallback is deliberately limited to local development. Production
  // checkout redirects must never trust an arbitrary Host header.
  if (process.env.NODE_ENV !== 'production') {
    const origin = requestOrigin(req);
    if (origin) return origin;
  }
  throw new HttpError(500, 'SITE_URL or VERCEL_URL must be configured.', 'server_misconfigured');
}

function getMediaBucket() {
  const bucket = readEnv('SUPABASE_MEDIA_BUCKET', { required: false }) || 'shadowglb-media';
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)) {
    throw new HttpError(500, 'SUPABASE_MEDIA_BUCKET is invalid.', 'server_misconfigured');
  }
  return bucket;
}

function parseAdminEmails(raw = process.env.ADMIN_EMAILS || '') {
  return String(raw)
    .split(/[;,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmailAllowed(email, raw = process.env.ADMIN_EMAILS || '') {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  return parseAdminEmails(raw).includes(normalized);
}

module.exports = {
  getSiteUrl,
  getMediaBucket,
  getStripeSecretKey,
  getStripeWebhookSecret,
  getSupabaseAnonKey,
  getSupabaseServiceKey,
  getSupabaseUrl,
  isAdminEmailAllowed,
  normalizeSiteUrl,
  parseAdminEmails,
  readEnv,
};
