import { admin, userClient, cors, json, kenyaPhone, darajaBase, darajaToken } from "../_shared/clients.ts";
Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
 if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
 try {
  const auth = await userClient(req).auth.getUser();
  if (auth.error || !auth.data.user) return json({ error: "Authentication required" }, 401);
  const { order_id, phone } = await req.json();
  if (typeof order_id !== "string" || typeof phone !== "string") return json({ error: "order_id and phone are required" }, 400);
  const db = admin();
  const { data: order, error } = await db.from("orders").select("id,buyer_id,amount_kes,status").eq("id", order_id).single();
  if (error || !order || order.buyer_id !== auth.data.user.id) return json({ error: "Order not found" }, 404);
  if (order.status !== "pending_payment" || order.amount_kes < 1) return json({ error: "Order is not payable" }, 409);
  const { data: existing } = await db.from("payments").select("id,status").eq("order_id", order_id).in("status", ["initiated","pending"]).maybeSingle();
  if (existing) return json({ error: "A payment attempt is already pending. Check its status before retrying." }, 409);
  const msisdn = kenyaPhone(phone), shortcode = Deno.env.get("MPESA_SHORTCODE")!, passkey = Deno.env.get("MPESA_PASSKEY")!;
  const transactionType = Deno.env.get("MPESA_TRANSACTION_TYPE") ?? "CustomerPayBillOnline";
  const callback = Deno.env.get("MPESA_CALLBACK_URL")!;
  if (!shortcode || !passkey || !callback?.startsWith("https://")) return json({ error: "Daraja sandbox is not fully configured" }, 503);
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0,14);
  const password = btoa(shortcode + passkey + timestamp);
  const paymentId = crypto.randomUUID();
  const { error: insertError } = await db.from("payments").insert({ id: paymentId, order_id, buyer_id: auth.data.user.id, amount_kes: order.amount_kes, phone_number: msisdn, status: "initiated" });
  if (insertError) throw insertError;
  const token = await darajaToken();
  const response = await fetch(darajaBase()+"/mpesa/stkpush/v1/processrequest", {
   method:"POST", headers:{ Authorization:"Bearer "+token, "Content-Type":"application/json" },
   body:JSON.stringify({ BusinessShortCode:shortcode, Password:password, Timestamp:timestamp, TransactionType:transactionType, Amount:order.amount_kes, PartyA:msisdn, PartyB:shortcode, PhoneNumber:msisdn, CallBackURL:callback, AccountReference:"TECHINFIN-"+order.id.slice(0,8), TransactionDesc:"TechInfin software purchase" })
  });
  const result = await response.json();
  if (!response.ok || result.ResponseCode !== "0" || !result.CheckoutRequestID) {
   await db.from("payments").update({status:"failed",result_description:result.errorMessage ?? result.ResponseDescription ?? "STK request failed"}).eq("id",paymentId);
   return json({error:"Safaricom did not accept the sandbox STK request",details:result.errorMessage ?? result.ResponseDescription},502);
  }
  await db.from("payments").update({status:"pending",merchant_request_id:result.MerchantRequestID,checkout_request_id:result.CheckoutRequestID,result_description:result.CustomerMessage ?? "STK prompt sent"}).eq("id",paymentId);
  return json({ ok:true, payment_id:paymentId, message:"Sandbox STK prompt sent. Complete it on the test handset, then refresh payment status." });
 } catch(e) { return json({error:e instanceof Error?e.message:"Payment request failed"},400); }
});
