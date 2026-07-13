# ShadowGLB

Production storefront for ShadowGLB. It replaces the previous single-file browser-admin implementation while preserving the existing Supabase project and its `shadowgbl_store` record.

## Customer routes

- `/` — store landing page
- `/systems` — Systems & Templates
- `/wall` — image-only visual archive
- `/products/:id` — canonical product page
- `/checkout/success` — server-verified payment confirmation and delivery
- `/admin` — Supabase Auth-protected control panel

## Local setup

1. Copy `.env.example` to `.env` and fill it with **test-mode** values from the existing services.
2. Run `pnpm install`.
3. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
4. Use `vercel dev` for checkout, webhook, admin, and delivery API testing. `pnpm dev` serves only the built public shell.

This repository never creates a Supabase or Vercel project. See `supabase/` for the two-phase, data-preserving migration and safe rollout order.

## Release safety

Apply the additive foundation migration, then deploy the feature branch to a Vercel Preview with Stripe test keys. Verify a complete test purchase, signed webhook, order record, confirmation email (when configured), and delivery access before merging into `main`. Apply the separate store-table lockdown only after the new production frontend is live and confirmed healthy.
