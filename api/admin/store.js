'use strict';

const { authenticateAdmin } = require('../_lib/auth');
const { allowMethods, assertSameOrigin, HttpError, readJson, sendError, sendJson } = require('../_lib/http');
const { getStoreRow, updateStoreRow } = require('../_lib/supabase');
const { mergeAdminStore, sanitizeAdminStore } = require('../_lib/store');

async function handler(req, res) {
  try {
    const method = allowMethods(req, ['GET', 'PUT']);
    await authenticateAdmin(req, res);
    if (method === 'GET') {
      const row = await getStoreRow();
      sendJson(res, 200, { data: sanitizeAdminStore(row.data), updatedAt: row.updated_at || null });
      return;
    }

    assertSameOrigin(req);
    const body = await readJson(req, 6 * 1024 * 1024);
    if (!Object.prototype.hasOwnProperty.call(body, 'expectedUpdatedAt')) {
      throw new HttpError(428, 'expectedUpdatedAt is required. Reload the store and try again.', 'precondition_required');
    }
    const current = await getStoreRow();
    const expected = body.expectedUpdatedAt == null ? null : String(body.expectedUpdatedAt);
    const actual = current.updated_at == null ? null : String(current.updated_at);
    if (expected !== actual) throw new HttpError(409, 'The store changed since it was opened. Reload and try again.', 'store_conflict', { updatedAt: actual });
    const nextData = mergeAdminStore(current.data, body.data);
    const updatedAt = new Date().toISOString();
    const saved = await updateStoreRow(nextData, actual, updatedAt);
    sendJson(res, 200, { data: sanitizeAdminStore(saved.data), updatedAt: saved.updated_at });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
