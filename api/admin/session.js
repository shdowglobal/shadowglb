'use strict';

const { authenticateAdmin } = require('../_lib/auth');
const { allowMethods, sendError, sendJson } = require('../_lib/http');

async function handler(req, res) {
  try {
    allowMethods(req, ['GET']);
    const session = await authenticateAdmin(req, res);
    sendJson(res, 200, { authenticated: true, user: session.user });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
