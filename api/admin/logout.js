'use strict';

const { ACCESS_COOKIE, clearSessionCookies, parseCookies, revokeSession } = require('../_lib/auth');
const { allowMethods, assertSameOrigin, sendError, sendJson } = require('../_lib/http');

async function handler(req, res) {
  try {
    allowMethods(req, ['POST']);
    assertSameOrigin(req);
    const accessToken = parseCookies(req)[ACCESS_COOKIE];
    await revokeSession(accessToken);
    clearSessionCookies(res);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    clearSessionCookies(res);
    sendError(res, error);
  }
}

module.exports = handler;
