import { admin, cors, darajaBase, darajaToken, json } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ResultCode: 1, ResultDesc: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const callback = body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) return json({ ResultCode: 0, ResultDesc: "Callback acknowledged" });

    const db = admin();
    const { data: payment, error } = await db.from("payments").select("*")
      .eq("checkout_request_id", callback.CheckoutRequestID).maybeSingle();
    if (error) throw error;
    if (!payment) return json({ ResultCode: 0, ResultDesc: "Unknown checkout acknowledged" });
    if (payment.status === "paid") return json({ ResultCode: 0, ResultDesc: "Already processed" });

    const resultCode = String(callback.ResultCode ?? "");
    const metadata = callback.CallbackMetadata?.Item ?? [];
    const item = (name: string) => metadata.find((x: any) => x.Name === name)?.Value;
    const callbackAmount = Number(item("Amount"));
    const receipt = item("MpesaReceiptNumber") ? String(item("MpesaReceiptNumber")) : null;

    // Persist the callback before calling Daraja. If Daraja's query API is
    // temporarily unavailable, payment-status can safely retry reconciliation.
    await db.from("payments").update({
      status: resultCode === "0" ? "pending" : "failed",
      result_code: resultCode,
      result_description: resultCode === "0" ? "Callback received; awaiting Daraja verification" : String(callback.ResultDesc ?? "Payment was not completed"),
      raw_callback: body,
      updated_at: new Date().toISOString()
    }).eq("id", payment.id).neq("status", "paid");

    if (resultCode !== "0" || callbackAmount !== payment.amount_kes || !receipt) {
      return json({ ResultCode: 0, ResultDesc: "Callback stored; payment not marked paid" });
    }

    const token = await darajaToken();
    const shortcode = Deno.env.get("MPESA_STK_QUERY_SHORTCODE") ?? Deno.env.get("MPESA_SHORTCODE")!;
    const passkey = Deno.env.get("MPESA_PASSKEY")!;
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const query = await fetch(darajaBase() + "/mpesa/stkpushquery/v1/query", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: btoa(shortcode + passkey + timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: callback.CheckoutRequestID
      })
    });
    const verification = await query.json();
    const verified = query.ok && String(verification.ResultCode ?? "") === "0";
    if (!verified) return json({ ResultCode: 0, ResultDesc: "Callback saved; Daraja verification will be retried" });

    const now = new Date().toISOString();
    const { error: payError } = await db.from("payments").update({
      status: "paid",
      mpesa_receipt_number: receipt,
      result_code: "0",
      result_description: "Verified by Daraja STK Query",
      verified_at: now,
      updated_at: now
    }).eq("id", payment.id).neq("status", "paid");
    if (payError) throw payError;
    await db.from("orders").update({ status: "paid", paid_at: now })
      .eq("id", payment.order_id).eq("status", "pending_payment");
    return json({ ResultCode: 0, ResultDesc: "Payment verified and order updated" });
  } catch (_error) {
    // Return a successful Daraja acknowledgement; the persisted pending record
    // is reconciled by the buyer's payment-status request.
    return json({ ResultCode: 0, ResultDesc: "Callback acknowledged for reconciliation" });
  }
});
