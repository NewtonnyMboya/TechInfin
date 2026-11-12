# TechInfin secure marketplace setup

## Current state
This repository's Android APK is a WebView wrapper around the frontend prototype. These backend sources establish the production architecture, but the live service is NOT active until you supply a Supabase project, apply the migration, deploy the Edge Functions, configure secrets, and complete end-to-end tests. Do not publish the current APK as a live store.

## 1. Supabase
1. Create a dedicated Supabase project for TechInfin.
2. In SQL Editor, apply `supabase/migrations/202611120001_marketplace.sql` (or use Supabase CLI: `supabase link --project-ref YOUR_REF && supabase db push`).
3. Enable email/password authentication. Configure email confirmation, password recovery, redirect URLs and SMTP before public launch.
4. Set the admin role only from trusted SQL/admin tooling after verifying the operator. Never allow users to set their own role.
5. Create a public marketplace domain and add it to Supabase Auth redirect allow-list.
6. Deploy functions in `supabase/functions` and configure secrets listed below.

The `software-private` Storage bucket is private. Do not change it to public. The service-role key is server-only. The anon/publishable key may be used in the browser with RLS enabled.

## 2. Required Supabase secrets
Set with `supabase secrets set KEY=value` (never commit values):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MPESA_ENV=sandbox`
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `MPESA_CALLBACK_URL` (public HTTPS URL to deployed mpesa-callback function)
- `MPESA_STK_QUERY_SHORTCODE` (normally same sandbox shortcode)
- `MPESA_TRANSACTION_TYPE` (sandbox-supported type supplied by Daraja)

Use only sandbox credentials for this stage. Do not share consumer secrets or passkeys in chat or commit them to GitHub.

## 3. M-PESA sandbox
Register an app in Safaricom Daraja, obtain sandbox credentials and a sandbox shortcode/passkey, configure the callback URL, and test using Safaricom's sandbox test numbers. The STK callback must be independently verified using the Daraja STK Query endpoint before an order becomes paid. The code must never treat a browser redirect or client-side "success" as proof of payment. No live shortcode or production credentials are used by this sandbox setup.

## 4. Seller and software delivery
Seller applications start pending. An admin must verify identity, ownership/licensing rights and support details, then approve the seller. Sellers can upload only to their own private storage path. Product listings remain unpublished pending review. Buyers receive a time-limited signed download URL only after a paid order item is confirmed by the server. Scan uploads for malware, enforce file size/type policy, compute SHA-256, and maintain a takedown/report process before accepting public uploads.

## 5. Public hosting and Android
Host the web marketplace on HTTPS (for example Vercel, Netlify, or a managed web host) and configure the Android WebView to load that production domain after acceptance tests. Keep a local offline fallback only if it does not bypass auth/payment. Add Android file chooser/download handling, safe external-link policy, network error states, and deep-link return handling. Publish a signed release APK only after device testing.

## 6. Launch gate
- Supabase Auth signup/login/password reset and RLS tests pass.
- Seller application/approval and product moderation pass.
- Private uploads and unauthorized download denial pass.
- M-PESA sandbox success, cancel, timeout, duplicate callback and failed payment tests pass.
- Amount/order reconciliation uses server-calculated KES totals.
- Privacy policy, terms, refund policy, seller agreement, contact/support and data deletion process are published.
- Verify software ownership/licensing, malware scanning, consumer protection, tax and applicable Kenyan business/payment obligations.
- Production Daraja access and authorized business details verified by Safaricom before any live payments.
