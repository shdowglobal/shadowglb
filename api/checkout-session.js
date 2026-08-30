'use strict';

const crypto = require('crypto');
const { allowMethods, HttpError, queryParam, sendError, sendJson, setSecurityHeaders } = require('./_lib/http');
const { getSiteUrl } = require('./_lib/env');
const { downloadDeliveryObject, getStoreRow } = require('./_lib/supabase');
const { retrieveCheckoutSession } = require('./_lib/stripe');
const {
  deliveryAssetForProduct,
  findProduct,
  parsePriceToMinor,
  productDeliveryPackage,
  productName,
  validateProductId,
} = require('./_lib/store');

function safeAttachmentName(value) {
  return String(value || 'SHADOWGLB_DELIVERY.zip').replace(/[\r\n"\\/]/g, '_').slice(0, 255);
}

async function verifyPaidAccess(sessionId, productId) {
  const session = await retrieveCheckoutSession(sessionId);
  if (session.payment_status !== 'paid') {
    throw new HttpError(402, 'Payment has not been confirmed yet.', 'payment_not_confirmed');
  }
  const paidProductId = validateProductId(session.metadata && session.metadata.product_id);
  const expectedAmount = Number(session.metadata && session.metadata.unit_amount);
  if (paidProductId !== productId || !Number.isSafeInteger(expectedAmount) || expectedAmount < 1 || session.amount_total !== expectedAmount) {
    throw new HttpError(403, 'This payment does not unlock the requested product.', 'delivery_not_authorized');
  }
}

async function sendDelivery(req, res) {
  const productId = validateProductId(queryParam(req, 'product_id'));
  const row = await getStoreRow();
  const product = findProduct(row.data, productId, { includeInactive: true });
  const asset = deliveryAssetForProduct(product);
  if (!asset) throw new HttpError(404, 'The delivery file is not configured.', 'delivery_not_configured');
  const price = parsePriceToMinor(product.price, { allowZero: true });
  if (price > 0) await verifyPaidAccess(queryParam(req, 'session_id'), productId);

  const buffer = await downloadDeliveryObject(asset.path, asset.bucket || undefined);
  if (buffer.length !== asset.size) {
    throw new HttpError(502, 'The delivery file failed its size check.', 'delivery_integrity_error');
  }
  if (asset.sha256) {
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (digest.toLowerCase() !== asset.sha256.toLowerCase()) {
      throw new HttpError(502, 'The delivery file failed its integrity check.', 'delivery_integrity_error');
    }
  }

  setSecurityHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', asset.contentType || 'application/zip');
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', `attachment; filename="${safeAttachmentName(asset.fileName)}"`);
  res.end(buffer);
}

async function handler(req, res) {
  try {
    allowMethods(req, ['GET']);
    if (queryParam(req, 'delivery') === '1') {
      await sendDelivery(req, res);
      return;
    }
    const session = await retrieveCheckoutSession(queryParam(req, 'session_id'));
    if (session.payment_status !== 'paid') {
      throw new HttpError(402, 'Payment has not been confirmed yet.', 'payment_not_confirmed');
    }
    const productId = validateProductId(session.metadata && session.metadata.product_id);
    const expectedAmount = Number(session.metadata && session.metadata.unit_amount);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount < 1 || session.amount_total !== expectedAmount) {
      throw new HttpError(409, 'The paid session could not be matched to the order.', 'order_mismatch');
    }
    const row = await getStoreRow();
    const product = findProduct(row.data, productId, { includeInactive: true });
    const delivery = productDeliveryPackage(product, row.data, {
      includePrivateNetwork: true,
      siteUrl: getSiteUrl(req),
      sessionId: session.id,
    });
    const customerEmail = (session.customer_details && session.customer_details.email) || session.customer_email || null;
    const name = productName(product);
    sendJson(res, 200, {
      paid: true,
      sessionId: session.id,
      product: { id: productId, name },
      deliveryUrl: delivery.url,
      customerEmail,
      order: {
        productId,
        productName: name,
        amountTotal: session.amount_total,
        currency: String(session.currency || session.metadata.currency || 'gbp').toLowerCase(),
        customerEmail,
      },
      delivery: delivery.url ? { status: 'ready', ...delivery } : { status: 'pending', url: null, items: [], message: null },
    });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
