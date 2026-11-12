import { admin, userClient, cors, json } from "../_shared/clients.ts";
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const auth=await userClient(req).auth.getUser();if(auth.error||!auth.data.user)return json({error:"Sign in required"},401);
  const {product_id}=await req.json();if(typeof product_id!=="string")return json({error:"product_id required"},400);
  const db=admin(),uid=auth.data.user.id;
  const {data:product}=await db.from("products").select("id,storage_path,status").eq("id",product_id).maybeSingle();
  if(!product||!product.storage_path||product.status!=="published")return json({error:"Product unavailable"},404);
  const {data:items}=await db.from("order_items").select("order_id,orders!inner(id,buyer_id,status)").eq("product_id",product_id).eq("orders.buyer_id",uid).eq("orders.status","paid").limit(1);
  if(!items?.length)return json({error:"A verified paid order is required for this download"},403);
  const orderId=items[0].order_id;
  const {error:logError}=await db.from("download_events").insert({buyer_id:uid,product_id,order_id:orderId});if(logError)throw logError;
  const {data,error}=await db.storage.from("software-private").createSignedUrl(product.storage_path,120,{download:true});
  if(error)throw error;
  return json({download_url:data.signedUrl,expires_in_seconds:120});
 }catch(e){return json({error:e instanceof Error?e.message:"Download request failed"},400);}
});
