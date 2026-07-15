# ShadowGLB server API

All functions are Vercel Node CommonJS handlers and use native `fetch`/`crypto`; they add no runtime package dependency.

## Environment variables

Required:

- `SUPABASE_URL` or the existing `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY` or the existing `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase Auth only)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never use a `NEXT_PUBLIC_` name)
- `STRIPE_SECRET_KEY` (server-only)
- `STRIPE_WEBHOOK_SECRET` (server-only and environment-specific)
- `ADMIN_EMAILS` (comma/space/semicolon-separated exact Supabase Auth email allowlist)
- `SITE_URL`, or Vercel's `VERCEL_URL`, for trusted Checkout redirects

Optional buyer delivery email:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (a verified Resend sender)

Optional media override:

- `SUPABASE_MEDIA_BUCKET` (defaults to the migrated `shadowglb-media` public storefront-media bucket)

## Routes

- `GET /api/store`: active products and display-only store content. Checkout and delivery fields are removed.
- `POST /api/checkout` with `{ "productId": "...", "email": "optional@example.com" }`: resolves the live product, secure delivery URL, and price server-side and creates a real Stripe Checkout Session. Success returns to `/checkout/success/`; cancellation returns to the product route.
- `GET /api/checkout-session?session_id=cs_...`: confirms the session is paid before returning that product's delivery URL.
- `POST /api/webhooks/stripe` (also `/api/stripe-webhook`): verifies the raw-body Stripe signature, records the order idempotently, and optionally emails the buyer.
- `/api/admin/login`, `/session`, `/logout`: Supabase Auth with secure HttpOnly cookies and the `ADMIN_EMAILS` allowlist.
- `GET|PUT /api/admin/store`: authenticated store editor. Save with `{ "data": {...}, "expectedUpdatedAt": "..." }`; stale saves return `409`.
- `POST /api/admin/upload`: authenticated small base64 upload, or creation of a signed direct-upload URL for larger public storefront media.
- `GET /api/admin/orders?limit=50&offset=0`: authenticated order ledger.

The public media bucket is not a delivery vault. Paid files must remain behind the server-only delivery field or another access-controlled service.
