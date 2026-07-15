'use strict';

const { HttpError } = require('./http');

const PRODUCT_PUBLIC_FIELDS = [
  'id', 'slug', 'name', 'title', 'category', 'price', 'origPrice', 'currency',
  'desc', 'description', 'tags', 'includes', 'badge', 'ptype', 'type', 'kind',
  'imageUrl', 'cover', 'images', 'media', 'sold', 'featured', 'page', 'section',
];

const PUBLIC_TOP_LEVEL_FIELDS = [
  'content', 'gallery', 'wall', 'navigation', 'nav', 'pages', 'collections',
  'systems', 'templates', 'images', 'branding',
];

const FORBIDDEN_PUBLIC_KEY = /(password|\bpwd\b|secret|token|service.?role|api.?key|webhook|stripe|delivery|download|w3key|web3forms)/i;
const SENSITIVE_ADMIN_KEY = /^(pwd|password|serviceRoleKey|supabaseKey|stripeSecretKey|stripeWebhookSecret|webhookSecret|w3key)$/i;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanString(value, maxLength = 5000) {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, maxLength);
}

function safePublicUrl(value, options = {}) {
  if (typeof value !== 'string') return null;
  if (options.allowData && value.length <= (options.dataMaxLength || 5 * 1024 * 1024) && /^data:(image|video)\/[a-z0-9.+-]+;base64,/i.test(value)) return value;
  if (value.length > (options.maxLength || 4000)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:')) return null;
    return url.toString();
  } catch (_error) {
    return null;
  }
}

function sanitizeDisplayTree(value, depth = 0, key = '') {
  if (depth > 8 || FORBIDDEN_PUBLIC_KEY.test(key)) return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, 100000);
  if (Array.isArray(value)) {
    return value.slice(0, 1000).map((item) => sanitizeDisplayTree(item, depth + 1, key)).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return undefined;
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (FORBIDDEN_PUBLIC_KEY.test(childKey) || ['__proto__', 'prototype', 'constructor'].includes(childKey)) continue;
    const cleaned = sanitizeDisplayTree(childValue, depth + 1, childKey);
    if (cleaned !== undefined) output[childKey] = cleaned;
  }
  return output;
}

function sanitizeMedia(value) {
  if (typeof value === 'string') return safePublicUrl(value, { allowData: true });
  if (!isPlainObject(value)) return null;
  const output = {};
  for (const key of ['url', 'src', 'imageUrl', 'poster']) {
    if (value[key] !== undefined) {
      const url = safePublicUrl(value[key], { allowData: true });
      if (url) output[key] = url;
    }
  }
  for (const key of ['type', 'kind', 'alt', 'caption']) {
    const text = cleanString(value[key], key === 'caption' ? 1000 : 200);
    if (text !== undefined) output[key] = text;
  }
  return Object.keys(output).length ? output : null;
}

function sanitizeProduct(product) {
  if (!isPlainObject(product) || product.active === false) return null;
  const output = {};
  for (const key of PRODUCT_PUBLIC_FIELDS) {
    if (product[key] === undefined) continue;
    if (['imageUrl', 'cover'].includes(key)) {
      const url = safePublicUrl(product[key], { allowData: true });
      if (url) output[key] = url;
    } else if (['images', 'media'].includes(key)) {
      if (Array.isArray(product[key])) output[key] = product[key].map(sanitizeMedia).filter(Boolean).slice(0, 30);
    } else {
      const value = sanitizeDisplayTree(product[key], 0, key);
      if (value !== undefined) output[key] = value;
    }
  }
  if (output.id === undefined || (!output.name && !output.title)) return null;
  try {
    parsePriceToMinor(product.price);
    output.checkoutReady = Boolean(productDeliveryUrl(product));
  } catch (_error) {
    output.checkoutReady = false;
  }
  return output;
}

function sanitizePublicStore(data, updatedAt) {
  const raw = isPlainObject(data) ? data : {};
  const output = {
    products: Array.isArray(raw.products) ? raw.products.map(sanitizeProduct).filter(Boolean) : [],
    updatedAt: updatedAt || null,
  };
  for (const key of PUBLIC_TOP_LEVEL_FIELDS) {
    if (raw[key] === undefined) continue;
    if (['gallery', 'wall', 'images'].includes(key) && Array.isArray(raw[key])) {
      output[key] = raw[key].map(sanitizeMedia).filter(Boolean).slice(0, 1000);
    } else {
      const value = sanitizeDisplayTree(raw[key], 0, key);
      if (value !== undefined) output[key] = value;
    }
  }
  const email = raw.settings && cleanString(raw.settings.email, 320);
  if (email && validateEmail(email)) output.contactEmail = email.trim().toLowerCase();
  return output;
}

function validateProductId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(400, 'A valid productId is required.', 'invalid_product_id');
  }
  const id = String(value).trim();
  if (!id || id.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) {
    throw new HttpError(400, 'A valid productId is required.', 'invalid_product_id');
  }
  return id;
}

function parsePriceToMinor(value, options = {}) {
  const input = typeof value === 'number' ? String(value) : String(value == null ? '' : value).trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(input)) {
    throw new HttpError(422, 'The product has an invalid price.', 'invalid_product_price');
  }
  const [whole, fraction = ''] = input.split('.');
  const minor = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  const minimum = options.allowZero ? 0 : 1;
  if (!Number.isSafeInteger(minor) || minor < minimum || minor > 100000000) {
    throw new HttpError(422, 'The product has an invalid price.', 'invalid_product_price');
  }
  return minor;
}

function validateCurrency(value) {
  const currency = String(value || 'gbp').trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw new HttpError(422, 'The product currency is invalid.', 'invalid_currency');
  return currency;
}

function validateEmail(value) {
  return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateCheckoutBody(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'A JSON object is required.', 'invalid_request');
  const productId = validateProductId(body.productId !== undefined ? body.productId : body.id);
  let email = null;
  if (body.email !== undefined && body.email !== null && body.email !== '') {
    if (!validateEmail(body.email)) throw new HttpError(400, 'The email address is invalid.', 'invalid_email');
    email = body.email.trim().toLowerCase();
  }
  return { productId, email };
}

function findProduct(data, productId, options = {}) {
  const products = data && Array.isArray(data.products) ? data.products : [];
  const product = products.find((item) => item && String(item.id) === String(productId));
  if (!product || (!options.includeInactive && product.active === false)) {
    throw new HttpError(404, 'Product not found.', 'product_not_found');
  }
  return product;
}

function productName(product) {
  const name = cleanString(product && (product.name || product.title), 200);
  if (!name || !name.trim()) throw new HttpError(422, 'The product name is invalid.', 'invalid_product');
  return name.trim();
}

function productDeliveryUrl(product) {
  const value = product && (product.deliveryLink || product.delivery_url || product.downloadUrl || product.accessUrl);
  return safePublicUrl(value, { maxLength: 4000 });
}

function stripePriceId(product) {
  const value = product && (product.stripePriceId || product.stripe_price_id || product.priceId);
  return typeof value === 'string' && /^price_[A-Za-z0-9]+$/.test(value) ? value : null;
}

function assertSafeJson(value, state = { count: 0 }, depth = 0) {
  state.count += 1;
  if (state.count > 50000 || depth > 15) throw new HttpError(413, 'Store data is too large or deeply nested.', 'store_too_large');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpError(400, 'Store data contains an invalid number.', 'invalid_store');
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, state, depth + 1);
    return;
  }
  if (!isPlainObject(value)) throw new HttpError(400, 'Store data contains an invalid value.', 'invalid_store');
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new HttpError(400, 'Store data contains a forbidden key.', 'invalid_store');
    assertSafeJson(child, state, depth + 1);
  }
}

function validateAdminStoreInput(value) {
  if (!isPlainObject(value)) throw new HttpError(400, 'data must be a JSON object.', 'invalid_store');
  assertSafeJson(value);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > 5 * 1024 * 1024) throw new HttpError(413, 'Store data is too large.', 'store_too_large');
  if (value.products !== undefined) {
    if (!Array.isArray(value.products) || value.products.length > 500) throw new HttpError(400, 'products must be an array of at most 500 items.', 'invalid_products');
    const ids = new Set();
    for (const product of value.products) {
      if (!isPlainObject(product)) throw new HttpError(400, 'Every product must be an object.', 'invalid_product');
      const id = validateProductId(product.id);
      if (ids.has(id)) throw new HttpError(400, 'Product IDs must be unique.', 'duplicate_product_id');
      ids.add(id);
      productName(product);
      parsePriceToMinor(product.price == null || String(product.price).trim() === '' ? '0' : product.price,
  { allowZero: true }
);
      validateCurrency(product.currency || 'gbp');
    }
  }
  return JSON.parse(serialized);
}

function stripAdminSecrets(value, depth = 0) {
  if (depth > 15 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => stripAdminSecrets(item, depth + 1));
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_ADMIN_KEY.test(key)) continue;
    output[key] = stripAdminSecrets(child, depth + 1);
  }
  return output;
}

function mergeAdminStore(current, incoming) {
  const safeIncoming = validateAdminStoreInput(incoming);
  const existing = isPlainObject(current) ? current : {};
  const next = { ...existing, ...safeIncoming };
  // Legacy client-side credentials are not editable via the new API. They are
  // preserved in-place for a non-destructive rollout, then can be removed in a
  // separately approved cleanup after the new frontend is live.
  for (const key of ['pwd', 'password']) {
    if (Object.prototype.hasOwnProperty.call(existing, key)) next[key] = existing[key];
    else delete next[key];
  }
  next.settings = { ...(isPlainObject(existing.settings) ? existing.settings : {}), ...(isPlainObject(safeIncoming.settings) ? safeIncoming.settings : {}) };
  for (const key of ['w3key', 'web3formsKey']) {
    if (existing.settings && Object.prototype.hasOwnProperty.call(existing.settings, key)) next.settings[key] = existing.settings[key];
    else delete next.settings[key];
  }
  if (Object.prototype.hasOwnProperty.call(existing, 'stats')) next.stats = existing.stats;
  return next;
}

module.exports = {
  assertSafeJson,
  findProduct,
  isPlainObject,
  mergeAdminStore,
  parsePriceToMinor,
  productDeliveryUrl,
  productName,
  safePublicUrl,
  sanitizeAdminStore: stripAdminSecrets,
  sanitizeDisplayTree,
  sanitizeProduct,
  sanitizePublicStore,
  stripePriceId,
  validateAdminStoreInput,
  validateCheckoutBody,
  validateCurrency,
  validateEmail,
  validateProductId,
};
