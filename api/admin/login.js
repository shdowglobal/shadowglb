'use strict';

const { setSessionCookies, signInAdmin, publicAdminUser } = require('../_lib/auth');
const { allowMethods, assertSameOrigin, readJson, sendError, sendJson } = require('../_lib/http');

async function handler(req, res) {
  try {
    allowMethods(req, ['POST']);
    assertSameOrigin(req);
    const body = await readJson(req, 32 * 1024);
    const session = await signInAdmin(body.email, body.password);
    setSessionCookies(res, session);
    sendJson(res, 200, { authenticated: true, user: publicAdminUser(session.user) });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
