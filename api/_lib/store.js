'use strict';

const { HttpError } = require('./http');

const PRODUCT_PUBLIC_FIELDS = [
  'id', 'slug', 'name', 'title', 'category', 'price', 'origPrice', 'currency',
  'subtitle', 'desc', 'description', 'tags', 'includes', 'badge', 'ptype', 'type', 'kind',
  'ctaText', 'deliveryNoteTitle', 'deliveryNoteText',
  'imageUrl', 'cover', 'images', 'media', 'sold', 'visible', 'featured', 'featuredOrder', 'page', 'section',
];

const PUBLIC_TOP_LEVEL_FIELDS = [
  'content', 'gallery', 'wall', 'navigation', 'nav', 'pages', 'collections',
  'systems', 'templates', 'images', 'branding',
];

const FORBIDDEN_PUBLIC_KEY = /(password|\bpwd\b|secret|token|service.?role|api.?key|webhook|stripe|delivery|download|private.?telegram|customer.?invite|network.?invite|w3key|web3forms)/i;
const SENSITIVE_ADMIN_KEY = /^(pwd|password|serviceRoleKey|supabaseKey|stripeSecretKey|stripeWebhookSecret|webhookSecret|w3key)$/i;
const DELIVERY_TYPES = new Set(['access', 'download', 'workspace', 'community', 'bundle']);
const DELIVERY_LABELS = {
  access: 'Open your product',
  download: 'Download your files',
  workspace: 'Open the workspace',
  community: 'Join the private group',
  bundle: 'Open the delivery hub',
};

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
    parsePriceToMinor(product.price, { allowZero: true });
    output.checkoutReady = hasProductDelivery(product);
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

function cleanDeliveryLabel(value, fallback) {
  const label = cleanString(value, 100);
  return label && label.trim() ? label.trim() : fallback;
}

function deliveryType(value) {
  const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DELIVERY_TYPES.has(type) ? type : 'access';
}

function safeTelegramUrl(value) {
  const url = safePublicUrl(value, { maxLength: 500 });
  if (!url) return null;
  return ['t.me', 'telegram.me', 'www.telegram.me'].includes(new URL(url).hostname.toLowerCase()) ? url : null;
}

function deliveryAssetForProduct(product) {
  const value = product && product.deliveryAsset;
  if (!isPlainObject(value)) return null;
  const path = cleanString(value.path, 500);
  const fileName = cleanString(value.fileName, 255);
  const bucket = value.bucket === undefined ? null : cleanString(value.bucket, 63);
  const contentType = cleanString(value.contentType, 100) || 'application/zip';
  const sha256 = value.sha256 === undefined ? null : cleanString(value.sha256, 64);
  const size = Number(value.size);
  if (!path || path.startsWith('/') || path.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) return null;
  if (!fileName || !/^[^\\/\0]{1,255}\.zip$/i.test(fileName)) return null;
  if (bucket !== null && !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)) return null;
  if (!['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(contentType)) return null;
  if (!Number.isSafeInteger(size) || size < 1 || size > 50 * 1024 * 1024) return null;
  if (sha256 !== null && !/^[a-f0-9]{64}$/i.test(sha256)) return null;
  return { path, fileName, bucket, contentType, size, sha256 };
}

function deliveryAssetsForProduct(product) {
  if (!product || !isPlainObject(product)) return [];
  const raw = Array.isArray(product.deliveryAssets) ? product.deliveryAssets : [];
  const candidates = [...raw];
  if (product.deliveryAsset !== undefined && product.deliveryAsset !== null) candidates.unshift(product.deliveryAsset);
  const assets = [];
  const seen = new Set();
  for (const value of candidates.slice(0, 11)) {
    const asset = deliveryAssetForProduct({ deliveryAsset: value });
    if (!asset) continue;
    const key = `${asset.bucket || ''}/${asset.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assets.push(asset);
    if (assets.length === 10) break;
  }
  return assets;
}

function secureAssetDeliveryItems(product, options = {}) {
  const assets = deliveryAssetsForProduct(product);
  const siteUrl = safePublicUrl(options.siteUrl, { allowHttp: process.env.NODE_ENV !== 'production', maxLength: 1000 });
  if (!assets.length || !siteUrl) return [];
  let productId;
  try { productId = validateProductId(product.id); } catch (_error) { return []; }
  return assets.map((asset, index) => {
    const url = new URL('/api/checkout-session', siteUrl);
    url.searchParams.set('delivery', '1');
    url.searchParams.set('product_id', productId);
    if (assets.length > 1) url.searchParams.set('asset', String(index));
    if (typeof options.sessionId === 'string' && options.sessionId) url.searchParams.set('session_id', options.sessionId);
    return {
      label: cleanDeliveryLabel(
        index === 0 ? product.deliveryLabel : null,
        assets.length === 1 ? 'Download your files' : `Download ${asset.fileName}`,
      ),
      url: url.toString(),
      type: 'download',
    };
  });
}

function deliveryItem(value, fallbackType = 'access') {
  if (typeof value === 'string') {
    const [rawLabel, ...urlParts] = value.split('|');
    const url = safePublicUrl(urlParts.join('|').trim() || rawLabel.trim(), { maxLength: 4000 });
    if (!url) return null;
    const type = deliveryType(fallbackType);
    return {
      label: urlParts.length ? cleanDeliveryLabel(rawLabel, DELIVERY_LABELS[type]) : DELIVERY_LABELS[type],
      url,
      type,
    };
  }
  if (!isPlainObject(value)) return null;
  const url = safePublicUrl(value.url || value.href || value.link, { maxLength: 4000 });
  if (!url) return null;
  const type = deliveryType(value.type || fallbackType);
  return {
    label: cleanDeliveryLabel(value.label || value.name || value.title, DELIVERY_LABELS[type]),
    url,
    type,
  };
}

function productDeliveryPackage(product, storeData, options = {}) {
  const items = [];
  const seen = new Set();
  const add = (item) => {
    if (!item || seen.has(item.url)) return;
    seen.add(item.url);
    items.push(item);
  };
  for (const item of secureAssetDeliveryItems(product, options)) add(item);
  const type = deliveryType(product && product.deliveryType);
  const primaryValue = product && (product.deliveryLink || product.delivery_url || product.downloadUrl || product.accessUrl);
  const primaryUrl = safePublicUrl(primaryValue, { maxLength: 4000 });
  if (primaryUrl) {
    add({
      label: cleanDeliveryLabel(product && product.deliveryLabel, DELIVERY_LABELS[type]),
      url: primaryUrl,
      type,
    });
  }
  if (product && Array.isArray(product.deliveryItems)) {
    for (const value of product.deliveryItems.slice(0, 20)) add(deliveryItem(value));
  }
  if (options.includePrivateNetwork && isPlainObject(storeData) && isPlainObject(storeData.content)) {
    const privateUrl = safeTelegramUrl(storeData.content.privateTelegramUrl);
    if (privateUrl) add({ label: 'Join the private buyer network', url: privateUrl, type: 'community' });
  }
  const rawMessage = product && (product.deliveryMessage || product.deliveryNote || product.accessInstructions);
  const message = cleanString(rawMessage, 2000);
  return {
    url: items.length ? items[0].url : null,
    items,
    message: message && message.trim() ? message.trim() : null,
  };
}

function hasProductDelivery(product) {
  return Boolean(deliveryAssetsForProduct(product).length || productDeliveryPackage(product).url);
}

function productDeliveryUrl(product, storeData, options) {
  return productDeliveryPackage(product, storeData, options).url;
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
  if (value.content !== undefined) {
    if (!isPlainObject(value.content)) throw new HttpError(400, 'content must be a JSON object.', 'invalid_content');
    const { contactEmail, contactPhone, telegramUrl, privateTelegramUrl } = value.content;
    if (contactEmail !== undefined && contactEmail !== '' && !validateEmail(contactEmail)) {
      throw new HttpError(400, 'The contact email address is invalid.', 'invalid_contact_email');
    }
    if (contactPhone !== undefined && contactPhone !== '') {
      if (typeof contactPhone !== 'string') throw new HttpError(400, 'The WhatsApp number is invalid.', 'invalid_contact_phone');
      const digits = contactPhone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) throw new HttpError(400, 'The WhatsApp number is invalid.', 'invalid_contact_phone');
    }
    if (telegramUrl !== undefined && telegramUrl !== '') {
      if (!safeTelegramUrl(telegramUrl)) {
        throw new HttpError(400, 'Use a valid public Telegram channel URL.', 'invalid_telegram_url');
      }
    }
    if (privateTelegramUrl !== undefined && privateTelegramUrl !== '' && !safeTelegramUrl(privateTelegramUrl)) {
      throw new HttpError(400, 'Use a valid private Telegram invite URL.', 'invalid_private_telegram_url');
    }
  }
  if (value.products !== undefined) {
    if (!Array.isArray(value.products) || value.products.length > 500) throw new HttpError(400, 'products must be an array of at most 500 items.', 'invalid_products');
    const ids = new Set();
    for (const product of value.products) {
      if (!isPlainObject(product)) throw new HttpError(400, 'Every product must be an object.', 'invalid_product');
      const id = validateProductId(product.id);
      if (ids.has(id)) throw new HttpError(400, 'Product IDs must be unique.', 'duplicate_product_id');
      ids.add(id);
      // Inactive products are drafts and can be incomplete.
if (product.active === false) continue;

productName(product);
parsePriceToMinor(product.price, { allowZero: true });
validateCurrency(product.currency || 'gbp');

if (product.deliveryType !== undefined && !DELIVERY_TYPES.has(String(product.deliveryType).trim().toLowerCase())) {
  throw new HttpError(400, 'The product delivery type is invalid.', 'invalid_delivery_type');
}
if (product.deliveryLink !== undefined && product.deliveryLink !== '' && !safePublicUrl(product.deliveryLink, { maxLength: 4000 })) {
  throw new HttpError(400, 'The primary delivery link must be a valid HTTPS URL.', 'invalid_delivery_url');
}
if (product.deliveryItems !== undefined) {
  if (!Array.isArray(product.deliveryItems) || product.deliveryItems.length > 20) {
    throw new HttpError(400, 'Delivery items must be an array of at most 20 links.', 'invalid_delivery_items');
  }
  for (const item of product.deliveryItems) {
    if (!deliveryItem(item)) throw new HttpError(400, 'Every additional delivery item needs a valid HTTPS URL.', 'invalid_delivery_item');
  }
}
if (product.deliveryMessage !== undefined && (typeof product.deliveryMessage !== 'string' || product.deliveryMessage.length > 2000)) {
  throw new HttpError(400, 'The buyer delivery message is too long.', 'invalid_delivery_message');
}
if (product.deliveryAsset !== undefined && product.deliveryAsset !== null && !deliveryAssetForProduct(product)) {
  throw new HttpError(400, 'The secure delivery ZIP metadata is invalid.', 'invalid_delivery_asset');
}
if (product.deliveryAssets !== undefined) {
  if (!Array.isArray(product.deliveryAssets) || product.deliveryAssets.length > 10) {
    throw new HttpError(400, 'Secure delivery supports at most 10 uploaded files.', 'invalid_delivery_assets');
  }
  for (const asset of product.deliveryAssets) {
    if (!deliveryAssetForProduct({ deliveryAsset: asset })) {
      throw new HttpError(400, 'One of the secure delivery files is invalid.', 'invalid_delivery_asset');
    }
  }
}
if (product.featuredOrder !== undefined && product.featuredOrder !== null && product.featuredOrder !== '') {
  const order = Number(product.featuredOrder);
  if (!Number.isSafeInteger(order) || order < 0 || order > 999) {
    throw new HttpError(400, 'The featured position must be a whole number from 0 to 999.', 'invalid_featured_order');
  }
}

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
  deliveryAssetForProduct,
  deliveryAssetsForProduct,
  findProduct,
  hasProductDelivery,
  isPlainObject,
  mergeAdminStore,
  parsePriceToMinor,
  productDeliveryPackage,
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
