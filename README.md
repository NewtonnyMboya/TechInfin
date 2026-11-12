# TechInfin

A new Android-ready web software marketplace starter.

## Included
- Responsive software marketplace UI (home, search, categories, product details, cart, library, account)
- Working demo cart with browser localStorage
- Buyer/seller/admin role-ready navigation and seller upload form prototype
- Light/dark theme toggle
- Android WebView project (`app/`) loading bundled web assets offline
- GitHub Actions workflow to build and upload a debug APK artifact
- Supabase schema starter with RLS-oriented tables and storage guidance
- M-PESA Daraja sandbox integration notes (no live credentials or transfers)

## Build the APK
1. Create a new GitHub repository named `TechInfin`.
2. Upload the contents of this ZIP to the repository root.
3. Open **Actions** and enable workflows if GitHub prompts you.
4. Run **Build TechInfin Android APK** or push to `main`.
5. Download the `TechInfin-debug-apk` artifact from the successful workflow run.

The APK is a WebView shell with the marketplace frontend bundled locally. Cloud authentication,
payments, seller payouts and protected digital delivery require configuring Supabase and Daraja
credentials on a secure backend. Never put service-role keys or Daraja secrets in the app.

## Android build locally
Requires JDK 17 and Android SDK:
```bash
./gradlew assembleDebug
```
Output: `app/build/outputs/apk/debug/app-debug.apk`

## Backend setup
See `backend/supabase-schema.sql` and `docs/PAYMENTS_AND_SECURITY.md`.
