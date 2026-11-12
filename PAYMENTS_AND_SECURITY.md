# Payments, downloads and production security

## M-PESA
Use Safaricom Daraja **sandbox** first. Implement STK Push and callback handling in a trusted
server/Edge Function. The server must verify callback authenticity and reconcile the transaction
with the expected amount, shortcode, account reference and checkout order. Only mark an order
paid after server-side verification. Do not initiate live transfers from this starter.

Required server-side secrets (never frontend/app):
- consumer key and consumer secret
- shortcode and passkey
- callback URL configuration

## Digital software delivery
- Store binaries in a private Supabase Storage bucket.
- Verify paid order ownership on the server before issuing a short-lived signed URL.
- Never publish service-role keys or permanent public links.
- Scan uploads, enforce file type/size limits, and require seller ownership/licensing rights.
- Keep audit logs for approvals, downloads, refunds and seller changes.

## Seller payouts
Payouts require KYC/business verification, fraud checks, a ledger, reconciliation and explicit
authorization. Keep seller earnings separate from buyer payment status.

## Before production
Configure auth, RLS policies, storage policies, server functions, payment callbacks, monitoring,
privacy terms, refund rules and legal/software licensing review. The APK in this starter is a
UI prototype; it is not yet a live commerce/payment system.
