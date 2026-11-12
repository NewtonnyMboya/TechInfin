import { admin, cors, darajaBase, darajaToken, json } from "../_shared/clients.ts";
Deno.serve(async (req) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
 if (req.method !== "POST") return json({ ResultCode: 1, ResultDesc: "Method not allowed" }, 405);
 try {
  const body = await req.json();
  const callback = body?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) return json({ ResultCode: 0, ResultDesc: "Callback acknowledged" });
  const db=admin();
  const {data:payment}=await db.from("payments").select("*").eq("checkout_request_id",callback.CheckoutRequestID).maybeSingle();
  if (!payment) return json({ResultCode:0,ResultDesc:"Unknown checkout acknowledged"});
  if (payment.status==="paid") return json({ResultCode:0,ResultDesc:"Already processed"});
  const token=await darajaToken(), shortcode=Deno.env.get("MPESA_STK_QUERY_SHORTCODE") ?? Deno.env.get("MPESA_SHORTCODE")!, passkey=Deno.env.get("MPESA_PASSKEY")!;
  const timestamp=new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14);
  const query=await fetch(darajaBase()+"/mpesa/stkpushquery/v1/query",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({BusinessShortCode:shortcode,Password:btoa(shortcode+passkey+timestamp),Timestamp:timestamp,CheckoutRequestID:callback.CheckoutRequestID})});
  const verification=await query.json();
  const resultCode=String(callback.ResultCode ?? "");
  const metadata=callback.CallbackMetadata?.Item ?? [];
  const item=(name:string)=>metadata.find((x:any)=>x.Name===name)?.Value;
  const callbackAmount=Number(item("Amount"));
  const receipt=item("MpesaReceiptNumber") ? String(item("MpesaReceiptNumber")) : null;
  // Callback alone is not trusted. Verify the CheckoutRequestID with Daraja's STK Query API.
  const verified= query.ok && String(verification.ResultCode ?? "")==="0" && resultCode==="0" && callbackAmount===payment.amount_kes && !!receipt;
  if (verified) {
   const {error:payErr}=await db.from("payments").update({status:"paid",mpesa_receipt_number:receipt,result_code:"0",result_description:"Verified by Daraja STK Query",raw_callback:body,verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",payment.id).neq("status","paid");
   if (!payErr) await db.from("orders").update({status:"paid",paid_at:new Date().toISOString()}).eq("id",payment.order_id).eq("status","pending_payment");
  } else {
   await db.from("payments").update({status:resultCode==="0"?"pending":"failed",result_code:resultCode,result_description:"Callback received; Daraja verification pending or unsuccessful",raw_callback:body,updated_at:new Date().toISOString()}).eq("id",payment.id).neq("status","paid");
  }
  return json({ResultCode:0,ResultDesc:"Callback processed"});
 } catch(_e) { return json({ResultCode:0,ResultDesc:"Callback acknowledged for safe retry"}); }
});
