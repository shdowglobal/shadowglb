'use strict';

const { allowMethods, assertSameOrigin, HttpError, readJson, sendError, sendJson } = require('./_lib/http');
const { getSiteUrl } = require('./_lib/env');
const { getStoreRow } = require('./_lib/supabase');
const { findProduct, parsePriceToMinor, productDeliveryPackage, validateCheckoutBody } = require('./_lib/store');

async function handler(req, res) {
  try {
    allowMethods(req, ['POST']);
    assertSameOrigin(req);
    const input = validateCheckoutBody(await readJson(req, 32 * 1024));
    const row = await getStoreRow();
    const product = findProduct(row.data, input.productId);
    // Re-verify price server-side (allowing zero here only) so a paid product can
    // never be claimed for free just by calling this endpoint directly.
    const minor = parsePriceToMinor(product.price, { allowZero: true });
    if (minor !== 0) {
      throw new HttpError(422, 'This product is not free — use secure checkout instead.', 'not_free');
    }
    const delivery = productDeliveryPackage(product, row.data, { siteUrl: getSiteUrl(req) });
    if (!delivery.url) {
      throw new HttpError(422, 'This product is not ready for delivery yet.', 'delivery_not_configured');
    }
    sendJson(res, 200, { deliveryUrl: delivery.url, delivery: { status: 'ready', ...delivery } });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
