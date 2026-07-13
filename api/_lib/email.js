'use strict';

const { fetchWithTimeout } = require('./supabase');
const { safePublicUrl, validateEmail } = require('./store');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendDeliveryEmail({ to, productName, deliveryUrl }) {
  const apiKey = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim();
  const from = process.env.RESEND_FROM_EMAIL && process.env.RESEND_FROM_EMAIL.trim();
  const url = safePublicUrl(deliveryUrl, { maxLength: 4000 });
  if (!apiKey || !from) return { sent: false, skipped: 'not_configured' };
  if (!validateEmail(to) || !url) return { sent: false, skipped: 'missing_delivery' };

  const safeName = String(productName || 'your ShadowGLB product').slice(0, 200);
  const response = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to.trim().toLowerCase()],
      subject: `Your ShadowGLB access: ${safeName}`,
      text: `Payment confirmed. Access ${safeName} here: ${url}\n\nKeep this email for future access.`,
      html: `<div style="font-family:Arial,sans-serif;background:#050505;color:#f5f5f5;padding:32px"><h1 style="font-size:24px">Payment confirmed</h1><p>Your access to <strong>${escapeHtml(safeName)}</strong> is ready.</p><p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#00ff88;color:#000;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:700">Get access</a></p><p style="color:#999;font-size:13px">Keep this email for future access.</p></div>`,
    }),
  }, 12000);
  if (!response.ok) return { sent: false, skipped: 'provider_error' };
  return { sent: true };
}

module.exports = { escapeHtml, sendDeliveryEmail };
