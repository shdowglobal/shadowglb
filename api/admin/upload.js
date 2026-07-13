'use strict';

const crypto = require('crypto');
const { authenticateAdmin } = require('../_lib/auth');
const { allowMethods, assertSameOrigin, HttpError, readJson, sendError, sendJson } = require('../_lib/http');
const { createSignedMediaUpload, uploadMediaObject } = require('../_lib/supabase');

const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/avif', 'avif'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
]);
const DIRECT_UPLOAD_LIMIT = 2_500_000;
const SIGNED_UPLOAD_LIMIT = 50 * 1024 * 1024;

function validateUpload(body) {
  const contentType = String(body.contentType || '').trim().toLowerCase();
  const extension = MIME_EXTENSIONS.get(contentType);
  if (!extension) throw new HttpError(400, 'Only JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, and MOV media are allowed.', 'unsupported_media_type');
  if (typeof body.fileName !== 'string' || !body.fileName.trim() || body.fileName.length > 255) {
    throw new HttpError(400, 'A valid fileName is required.', 'invalid_file_name');
  }
  const size = body.size == null ? null : Number(body.size);
  if (size !== null && (!Number.isSafeInteger(size) || size < 1 || size > SIGNED_UPLOAD_LIMIT)) {
    throw new HttpError(413, 'Media must be 50 MiB or smaller.', 'media_too_large');
  }
  const date = new Date();
  const path = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${extension}`;
  return { contentType, extension, path, size };
}

function decodeBase64(value) {
  if (typeof value !== 'string') return null;
  const data = value.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw new HttpError(400, 'dataBase64 is invalid.', 'invalid_media_data');
  }
  return Buffer.from(data, 'base64');
}

async function handler(req, res) {
  try {
    allowMethods(req, ['POST']);
    assertSameOrigin(req);
    await authenticateAdmin(req, res);
    const body = await readJson(req, 4 * 1024 * 1024);
    const upload = validateUpload(body);
    const buffer = decodeBase64(body.dataBase64);
    if (buffer) {
      if (!buffer.length || buffer.length > DIRECT_UPLOAD_LIMIT) {
        throw new HttpError(413, 'Direct media uploads must be 2.5 MB or smaller. Request a signed upload for larger files.', 'media_too_large');
      }
      const url = await uploadMediaObject(upload.path, buffer, upload.contentType);
      sendJson(res, 201, { path: upload.path, url, mimeType: upload.contentType, size: buffer.length });
      return;
    }
    const signed = await createSignedMediaUpload(upload.path);
    sendJson(res, 200, {
      path: upload.path,
      url: signed.publicUrl,
      publicUrl: signed.publicUrl,
      signedUrl: signed.signedUrl,
      token: signed.token,
      method: 'PUT',
      mimeType: upload.contentType,
      maxBytes: SIGNED_UPLOAD_LIMIT,
    });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
