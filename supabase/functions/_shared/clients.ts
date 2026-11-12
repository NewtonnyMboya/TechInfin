import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export const userClient = (req: Request) => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
export const cors = { "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
export const kenyaPhone = (input: string) => { const n = input.replace(/[\s+()-]/g, ""); if (/^0[17]\d{8}$/.test(n)) return "254" + n.slice(1); if (/^254[17]\d{8}$/.test(n)) return n; throw new Error("Enter a valid Kenyan Safaricom number, e.g. 07XXXXXXXX"); };
export const darajaBase = () => Deno.env.get("MPESA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
export async function darajaToken() {
 const key = Deno.env.get("MPESA_CONSUMER_KEY")!, secret = Deno.env.get("MPESA_CONSUMER_SECRET")!;
 if (!key || !secret) throw new Error("Daraja sandbox credentials are not configured");
 const r = await fetch(darajaBase()+"/oauth/v1/generate?grant_type=client_credentials", { headers: { Authorization: "Basic "+btoa(key+":"+secret) } });
 const d = await r.json(); if (!r.ok || !d.access_token) throw new Error("Daraja OAuth failed"); return d.access_token as string;
}
