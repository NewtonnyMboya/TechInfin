import { admin, userClient, cors, json } from "../_shared/clients.ts";
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const auth=await userClient(req).auth.getUser();if(auth.error||!auth.data.user)return json({error:"Sign in before checkout"},401);
  const {items}=await req.json();if(!Array.isArray(items)||items.length<1||items.length>20)return json({error:"Cart must contain 1–20 products"},400);
  const qtyMap=new Map<string,number>();
  for(const row of items){if(typeof row?.product_id!=="string"||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>20)return json({error:"Invalid cart item"},400);qtyMap.set(row.product_id,(qtyMap.get(row.product_id)??0)+row.quantity);}
  if([...qtyMap.values()].some(q=>q>20))return json({error:"Product quantity limit exceeded"},400);
  const ids=[...qtyMap.keys()],db=admin();
  const {data:products,error}=await db.from("products").select("id,name,seller_id,price_kes,status").in("id",ids);
  if(error||!products||products.length!==ids.length||products.some(p=>p.status!=="published"))return json({error:"One or more products are unavailable"},409);
  const total=products.reduce((sum,p)=>sum+p.price_kes*qtyMap.get(p.id)!,0);
  if(!Number.isSafeInteger(total)||total<1||total>10000000)return json({error:"Order total outside permitted range"},400);
  const {data:order,error:orderError}=await db.from("orders").insert({buyer_id:auth.data.user.id,amount_kes:total,status:"pending_payment"}).select("id,amount_kes").single();
  if(orderError)throw orderError;
  const rows=products.map(p=>({order_id:order.id,product_id:p.id,seller_id:p.seller_id,product_name:p.name,unit_price_kes:p.price_kes,quantity:qtyMap.get(p.id)!}));
  const {error:itemError}=await db.from("order_items").insert(rows);
  if(itemError){await db.from("orders").delete().eq("id",order.id);throw itemError;}
  return json({order_id:order.id,amount_kes:order.amount_kes,currency:"KES"});
 }catch(e){return json({error:e instanceof Error?e.message:"Could not create order"},400);}
});
