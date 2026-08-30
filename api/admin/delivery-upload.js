'use strict';

const crypto = require('crypto');
const { authenticateAdmin } = require('../_lib/auth');
const { allowMethods, assertSameOrigin, HttpError, readJson, sendError, sendJson } = require('../_lib/http');
const { uploadDeliveryObject } = require('../_lib/supabase');
const { validateProductId } = require('../_lib/store');

const MAX_DIRECT_ZIP_BYTES = 3 * 1024 * 1024;

function decodeZip(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'ZIP data is required.', 'missing_delivery_data');
  const encoded = value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new HttpError(400, 'ZIP data is invalid.', 'invalid_delivery_data');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_DIRECT_ZIP_BYTES) {
    throw new HttpError(413, 'Secure delivery ZIPs must be 3 MB or smaller.', 'delivery_too_large');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || ![[0x03, 0x04], [0x05, 0x06], [0x07, 0x08]].some(([a, b]) => buffer[2] === a && buffer[3] === b)) {
    throw new HttpError(400, 'The selected file is not a valid ZIP archive.', 'invalid_delivery_zip');
  }
  return buffer;
}

function validateFileName(value) {
  const fileName = typeof value === 'string' ? value.trim() : '';
  if (!/^[^\\/\0]{1,255}\.zip$/i.test(fileName)) {
    throw new HttpError(400, 'A valid .zip file name is required.', 'invalid_file_name');
  }
  return fileName;
}

async function handler(req, res) {
  try {
    allowMethods(req, ['POST']);
    assertSameOrigin(req);
    await authenticateAdmin(req, res);
    const body = await readJson(req, 5 * 1024 * 1024);
    const productId = validateProductId(body.productId);
    const fileName = validateFileName(body.fileName);
    const buffer = decodeZip(body.dataBase64);
    const path = `releases/${productId}/${fileName}`;
    const stored = await uploadDeliveryObject(path, buffer, 'application/zip');
    sendJson(res, 201, {
      deliveryAsset: {
        bucket: stored.bucket,
        path: stored.path,
        fileName,
        contentType: 'application/zip',
        size: buffer.length,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };

