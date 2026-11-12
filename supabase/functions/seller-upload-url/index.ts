import { admin, userClient, cors, json } from "../_shared/clients.ts";
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const auth=await userClient(req).auth.getUser(); if(auth.error||!auth.data.user)return json({error:"Sign in required"},401);
  const {file_name,content_type}=await req.json();
  if(typeof file_name!=="string"||typeof content_type!=="string")return json({error:"File name and content type required"},400);
  const allowed=["application/zip","application/x-zip-compressed","application/octet-stream","application/pdf","application/vnd.android.package-archive"];
  if(!allowed.includes(content_type))return json({error:"Unsupported software file type"},415);
  const clean=file_name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
  if(!clean||clean.startsWith("."))return json({error:"Invalid file name"},400);
  const db=admin(),uid=auth.data.user.id;
  const {data:seller}=await db.from("seller_profiles").select("status").eq("user_id",uid).maybeSingle();
  if(seller?.status!=="approved")return json({error:"Seller account must be approved before uploading"},403);
  const path=uid+"/"+crypto.randomUUID()+"/"+clean;
  const {data,error}=await db.storage.from("software-private").createSignedUploadUrl(path);
  if(error)throw error;
  return json({path,token:data.token,signedUrl:data.signedUrl,expiresInSeconds:7200});
 }catch(e){return json({error:e instanceof Error?e.message:"Upload URL request failed"},400);}
});
