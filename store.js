'use strict';

const { allowMethods, sendError, sendJson } = require('./_lib/http');
const { getStoreRow } = require('./_lib/supabase');
const { sanitizePublicStore } = require('./_lib/store');

async function handler(req, res) {
  try {
    allowMethods(req, ['GET']);
    const row = await getStoreRow();
    sendJson(res, 200, sanitizePublicStore(row.data, row.updated_at));
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
