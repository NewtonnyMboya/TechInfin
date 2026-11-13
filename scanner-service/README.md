# TechInfin private malware scanner

This service is intended to run privately behind HTTPS on Google Cloud Run (or an equivalent managed container host). It downloads a short-lived signed URL from the private Supabase `software-private` bucket, validates the file extension/signature and archive integrity, computes SHA-256, and runs ClamAV. It does not publish or make the file public.

## Deploy on Google Cloud Run

Prerequisites: Google Cloud CLI authenticated, billing enabled, Cloud Run and Secret Manager APIs enabled, and Supabase CLI linked to project `unytieqnfzkmxhifovtn`.

Create a long random API key and store it in Secret Manager. Keep this file out of Git and never paste the key into chat:

```bash
openssl rand -hex 32 > scanner.key
chmod 600 scanner.key
gcloud secrets create techinfin-scanner-api-key --data-file=scanner.key
```

Deploy the scanner. Use a region close to the Supabase project/users:

```bash
gcloud run deploy techinfin-clamav \
  --source scanner-service \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 4Gi --cpu 2 --timeout 900 \
  --concurrency 1 --max-instances 2 \
  --set-env-vars SUPABASE_STORAGE_HOST=unytieqnfzkmxhifovtn.supabase.co \
  --set-secrets SCANNER_API_KEY=techinfin-scanner-api-key:latest
```

The Cloud Run URL is printed after deployment. The endpoint URL for Supabase is that URL plus `/scan`. The service is network reachable but requires the random bearer key; do not remove that check.

Set the Edge Function secrets without printing the key:

```bash
SCANNER_KEY="$(cat scanner.key)"
supabase secrets set \
  MALWARE_SCANNER_URL="https://YOUR-CLOUD-RUN-URL/scan" \
  MALWARE_SCANNER_API_KEY="$SCANNER_KEY" \
  --project-ref unytieqnfzkmxhifovtn
unset SCANNER_KEY
rm -f scanner.key
```

## Apply database changes and deploy Edge Functions

From the repository root:

```bash
supabase link --project-ref unytieqnfzkmxhifovtn
supabase db push
supabase functions deploy verify-software --project-ref unytieqnfzkmxhifovtn
supabase functions deploy seller-upload-url --project-ref unytieqnfzkmxhifovtn
supabase functions deploy software-download --project-ref unytieqnfzkmxhifovtn
supabase functions deploy create-order --project-ref unytieqnfzkmxhifovtn
supabase functions deploy mpesa-stk-push --project-ref unytieqnfzkmxhifovtn
supabase functions deploy mpesa-callback --project-ref unytieqnfzkmxhifovtn
supabase functions deploy payment-status --project-ref unytieqnfzkmxhifovtn
```

The migration adds trusted scan metadata and a database trigger that blocks publishing unless the scanner marks the uploaded file clean. It also prevents multiple active STK attempts for one order. Review the SQL migration before applying it if the project has existing active payment attempts.

## Integration test checklist

1. Sign in as an approved seller and upload a valid PDF, ZIP and APK separately.
2. Confirm each upload creates a private object and a `pending_review` product.
3. Confirm the scanner stores SHA-256, actual size, detected type, ClamAV engine and scan time.
4. Upload a file whose extension does not match its contents; it must fail verification.
5. Use the standard EICAR antivirus test string in a test-only file; ClamAV must mark it infected. Never upload real malware.
6. Attempt to publish a pending, infected or unsupported file; the database must reject it.
7. Publish a clean file as an administrator. Confirm it appears in the public catalogue.
8. Attempt download as an unpaid buyer and a different buyer; both must be denied.
9. Complete a sandbox M-PESA payment and confirm the order becomes paid only after Daraja STK Query verification. Also test cancellation, timeout, duplicate callback and wrong amount.
10. Download as the paid buyer; confirm a short-lived signed URL is returned and a download event is recorded.

A successful Android APK build does not prove these backend tests passed. Keep Daraja in sandbox until all tests pass and production credentials, callback URL, legal terms and operational controls have been reviewed.
