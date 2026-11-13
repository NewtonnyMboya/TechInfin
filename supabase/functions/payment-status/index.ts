import { admin, userClient, cors, json, darajaBase, darajaToken } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = await userClient(req).auth.getUser();
    if (auth.error || !auth.data.user) return json({ error: "Sign in required" }, 401);
    const { order_id } = await req.json();
    if (typeof order_id !== "string") return json({ error: "order_id required" }, 400);

    const db = admin();
    const { data: order } = await db.from("orders")
      .select("id,buyer_id,status,amount_kes,paid_at")
      .eq("id", order_id).eq("buyer_id", auth.data.user.id).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);

    let { data: payment } = await db.from("payments")
      .select("id,status,result_description,mpesa_receipt_number,created_at,checkout_request_id,amount_kes,raw_callback,result_code")
      .eq("order_id", order_id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    // Retry Daraja verification if the callback was received but its first
    // STK Query attempt failed or timed out.
    if (payment?.status === "pending" && payment.checkout_request_id && payment.result_code === "0" && payment.raw_callback) {
      try {
        const callback = payment.raw_callback?.Body?.stkCallback;
        const metadata = callback?.CallbackMetadata?.Item ?? [];
        const item = (name: string) => metadata.find((x: any) => x.Name === name)?.Value;
        const amount = Number(item("Amount"));
        const receipt = item("MpesaReceiptNumber") ? String(item("MpesaReceiptNumber")) : null;
        if (String(callback?.ResultCode ?? "") === "0" && amount === payment.amount_kes && receipt) {
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
              CheckoutRequestID: payment.checkout_request_id
            })
          });
          const verification = await query.json();
          if (query.ok && String(verification.ResultCode ?? "") === "0") {
            const now = new Date().toISOString();
            const { error: payError } = await db.from("payments").update({
              status: "paid",
              mpesa_receipt_number: receipt,
              result_description: "Verified by Daraja STK Query during status reconciliation",
              verified_at: now,
              updated_at: now
            }).eq("id", payment.id).neq("status", "paid");
            if (payError) throw payError;
            await db.from("orders").update({ status: "paid", paid_at: now })
              .eq("id", order_id).eq("status", "pending_payment");
          }
        }
      } catch (_reconciliationError) {
        // Keep the state pending. A later status check can safely retry.
      }
      const refreshed = await db.from("payments")
        .select("id,status,result_description,mpesa_receipt_number,created_at")
        .eq("id", payment.id).maybeSingle();
      payment = refreshed.data as typeof payment;
    }

    const { data: refreshedOrder } = await db.from("orders")
      .select("id,buyer_id,status,amount_kes,paid_at")
      .eq("id", order_id).eq("buyer_id", auth.data.user.id).maybeSingle();

    return json({
      order_status: refreshedOrder?.status ?? order.status,
      amount_kes: refreshedOrder?.amount_kes ?? order.amount_kes,
      paid_at: refreshedOrder?.paid_at ?? order.paid_at,
      payment: payment ? {
        status: payment.status,
        message: payment.result_description,
        receipt: payment.mpesa_receipt_number
      } : null
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not read payment status" }, 400);
  }
});
