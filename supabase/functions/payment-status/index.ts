import { admin, userClient, cors, json } from "../_shared/clients.ts";
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const auth=await userClient(req).auth.getUser();if(auth.error||!auth.data.user)return json({error:"Sign in required"},401);
  const {order_id}=await req.json();if(typeof order_id!=="string")return json({error:"order_id required"},400);
  const db=admin();
  const {data:order}=await db.from("orders").select("id,buyer_id,status,amount_kes,paid_at").eq("id",order_id).eq("buyer_id",auth.data.user.id).maybeSingle();
  if(!order)return json({error:"Order not found"},404);
  const {data:payment}=await db.from("payments").select("status,result_description,mpesa_receipt_number,created_at").eq("order_id",order_id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  return json({order_status:order.status,amount_kes:order.amount_kes,paid_at:order.paid_at,payment:payment?{status:payment.status,message:payment.result_description,receipt:payment.mpesa_receipt_number}:null});
 }catch(e){return json({error:e instanceof Error?e.message:"Could not read payment status"},400);}
});
