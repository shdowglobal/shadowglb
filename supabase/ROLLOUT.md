# ShadowGLB Supabase rollout

The two migrations preserve the existing `shadowgbl_store` row and its `data` JSON. Phase one adds the timestamp, private order ledger, and public storefront-media bucket without changing the old storefront's table access. Phase two closes that retired direct-browser access only after the new production frontend is live.

## Safe rollout order

1. Back up the existing `shadowgbl_store` row from the Supabase dashboard. Do not edit or reset it.
2. Apply `migrations/202607130001_shadowglb_production_backend.sql`. This additive phase does not remove the old live storefront's access.
3. Add the server environment variables documented in `api/README.md` to the Vercel Preview environment. Keep the service-role key server-only.
4. Deploy this branch to a Vercel Preview. Verify `/api/store`, Supabase Auth admin sign-in, admin save/reload, mobile navigation, and Stripe test-mode Checkout through the preview.
5. Configure a Stripe test webhook for `/api/webhooks/stripe`. Complete a test purchase, confirm delivery, and verify one paid order is recorded exactly once when Stripe retries the event.
6. Add the reviewed production values to Vercel Production and configure the production Stripe webhook with its separate signing secret.
7. Merge/deploy production only after the preview purchase journey passes. Smoke-test the new live storefront and admin immediately; it still works while the legacy store policies remain in place.
8. Apply `migrations/202607130002_shadowglb_store_lockdown.sql` to remove the retired browser's direct store-table access. Immediately repeat the live storefront and admin read/save checks.

## RLS and Storage notes

- Phase one makes the new `shadowgbl_orders` table private immediately. Phase two enables the final `shadowgbl_store` RLS posture with no browser policies. Only the server-side service role can then read or write either table.
- The lockdown removes policies only from `shadowgbl_store`. It does not alter unrelated production tables or delete any rows.
- `shadowglb-media` is public and is only for product covers, gallery images, and preview video. Never upload a paid digital-delivery file to it.
- If `SUPABASE_MEDIA_BUCKET` overrides that name, create and harden the alternate bucket separately before deploying the override; this migration only creates `shadowglb-media`.
- Supabase Storage can have project-wide permissive policies created outside this migration. Audit `storage.objects` policies and remove any broad anonymous upload/update/delete policy. Uploads from this application use a short-lived URL minted only after authenticated admin access.
- The legacy `pwd` and Web3Forms key inside the existing JSON are preserved during rollout, but are never returned by the new APIs. After phase two passes, remove them in a separately reviewed cleanup and rotate the old credentials.
