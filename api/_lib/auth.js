'use strict';

const { isAdminEmailAllowed } = require('./env');
const { HttpError } = require('./http');
const { UpstreamError, supabaseRequest } = require('./supabase');
const { validateEmail } = require('./store');

const ACCESS_COOKIE = 'shadowglb_admin_access';
const REFRESH_COOKIE = 'shadowglb_admin_refresh';

function parseCookies(req) {
  const output = {};
  const raw = req && req.headers && req.headers.cookie;
  for (const pair of String(raw || '').split(';')) {
    const index = pair.indexOf('=');
    if (index < 1) continue;
    const key = pair.slice(0, index).trim();
    try { output[key] = decodeURIComponent(pair.slice(index + 1).trim()); } catch (_error) { /* ignore malformed cookie */ }
  }
  return output;
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', cookie);
  else if (Array.isArray(existing)) res.setHeader('Set-Cookie', [...existing, cookie]);
  else res.setHeader('Set-Cookie', [existing, cookie]);
}

function serializeCookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ].filter(Boolean).join('; ');
}

function setSessionCookies(res, session) {
  if (!session || typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
    throw new HttpError(502, 'Supabase returned an invalid admin session.', 'auth_error');
  }
  appendSetCookie(res, serializeCookie(ACCESS_COOKIE, session.access_token, Number(session.expires_in) || 3600));
  appendSetCookie(res, serializeCookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
}

function clearSessionCookies(res) {
  appendSetCookie(res, serializeCookie(ACCESS_COOKIE, '', 0));
  appendSetCookie(res, serializeCookie(REFRESH_COOKIE, '', 0));
}

function publicAdminUser(user) {
  return { id: user.id, email: String(user.email || '').toLowerCase() };
}

function assertAllowedUser(user) {
  if (!user || !isAdminEmailAllowed(user.email)) throw new HttpError(403, 'This account is not authorized for store administration.', 'admin_not_allowed');
  return user;
}

async function signInAdmin(email, password) {
  if (!validateEmail(email) || typeof password !== 'string' || !password || password.length > 1024) {
    throw new HttpError(401, 'Invalid email or password.', 'invalid_credentials');
  }
  if (!isAdminEmailAllowed(email)) throw new HttpError(401, 'Invalid email or password.', 'invalid_credentials');
  try {
    const session = await supabaseRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      json: { email: email.trim().toLowerCase(), password },
    });
    assertAllowedUser(session && session.user);
    return session;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof UpstreamError && error.status >= 400 && error.status < 500) {
      throw new HttpError(401, 'Invalid email or password.', 'invalid_credentials');
    }
    throw error;
  }
}

async function getUser(accessToken) {
  return supabaseRequest('/auth/v1/user', { accessToken });
}

async function refreshSession(refreshToken) {
  return supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    json: { refresh_token: refreshToken },
  });
}

async function authenticateAdmin(req, res) {
  const cookies = parseCookies(req);
  let user = null;
  let accessToken = cookies[ACCESS_COOKIE];
  if (accessToken) {
    try {
      user = await getUser(accessToken);
    } catch (error) {
      if (!(error instanceof UpstreamError) || ![400, 401, 403].includes(error.status)) throw error;
    }
  }
  if (!user && cookies[REFRESH_COOKIE]) {
    try {
      const session = await refreshSession(cookies[REFRESH_COOKIE]);
      user = session.user;
      accessToken = session.access_token;
      setSessionCookies(res, session);
    } catch (error) {
      if (!(error instanceof UpstreamError) || ![400, 401, 403].includes(error.status)) throw error;
    }
  }
  if (!user) {
    clearSessionCookies(res);
    throw new HttpError(401, 'Admin sign-in required.', 'not_authenticated');
  }
  try {
    assertAllowedUser(user);
  } catch (error) {
    clearSessionCookies(res);
    throw error;
  }
  return { user: publicAdminUser(user), accessToken };
}

async function revokeSession(accessToken) {
  if (!accessToken) return;
  try {
    await supabaseRequest('/auth/v1/logout', { method: 'POST', accessToken });
  } catch (_error) {
    // Local cookies are still cleared. Supabase access tokens are short-lived.
  }
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authenticateAdmin,
  clearSessionCookies,
  parseCookies,
  publicAdminUser,
  revokeSession,
  serializeCookie,
  setSessionCookies,
  signInAdmin,
};
