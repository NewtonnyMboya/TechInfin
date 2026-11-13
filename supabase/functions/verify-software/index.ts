import { admin, userClient, cors, json } from "../_shared/clients.ts";

// The scanner is a private ClamAV-backed service. It receives a short-lived
// signed URL and must fetch, validate file signatures, scan the complete file,
// then return {clean, sha256, size_bytes, detected_mime, engine}.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = await userClient(req).auth.getUser();
    if (auth.error || !auth.data.user) return json({ error: "Sign in required" }, 401);
    const { product_id } = await req.json();
    if (typeof product_id !== "string") return json({ error: "product_id required" }, 400);

    const scannerUrl = Deno.env.get("MALWARE_SCANNER_URL");
    const scannerKey = Deno.env.get("MALWARE_SCANNER_API_KEY");
    if (!scannerUrl || !scannerKey || !scannerUrl.startsWith("https://")) {
      return json({ error: "Malware scanner is not configured. Product remains private and cannot be published." }, 503);
    }

    const db = admin();
    const uid = auth.data.user.id;
    const { data: product, error } = await db.from("products")
      .select("id,seller_id,storage_path,status,scan_status")
      .eq("id", product_id).maybeSingle();
    if (error) throw error;
    if (!product || !product.storage_path) return json({ error: "Uploaded product file not found" }, 404);

    const { data: profile } = await db.from("seller_profiles")
      .select("status").eq("user_id", uid).maybeSingle();
    const { data: account } = await db.from("profiles")
      .select("role").eq("id", uid).maybeSingle();
    const isAdmin = account?.role === "admin";
    if (!isAdmin && (product.seller_id !== uid || profile?.status !== "approved")) {
      return json({ error: "Only the owner-approved seller or an administrator may request verification" }, 403);
    }
    if (!isAdmin && !product.storage_path.startsWith(uid + "/")) {
      return json({ error: "File path does not belong to this seller" }, 403);
    }
    if (product.status === "published") return json({ error: "Published products cannot be rescanned through this endpoint" }, 409);

    const { data: signed, error: signError } = await db.storage
      .from("software-private").createSignedUrl(product.storage_path, 300);
    if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not create scanner access URL");

    await db.from("products").update({ scan_status: "scanning" }).eq("id", product_id);
    const response = await fetch(scannerUrl, {
      method: "POST",
      headers: { "Authorization": "Bearer " + scannerKey, "Content-Type": "application/json" },
      body: JSON.stringify({ download_url: signed.signedUrl, file_name: product.storage_path.split("/").pop(), max_bytes: 524288000, product_id })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.clean !== "boolean" ||
        typeof result.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(result.sha256) ||
        !Number.isSafeInteger(result.size_bytes) || result.size_bytes < 1 || result.size_bytes > 524288000 ||
        typeof result.detected_mime !== "string" || typeof result.engine !== "string") {
      await db.from("products").update({ scan_status: "error" }).eq("id", product_id);
      return json({ error: "Scanner response was invalid or the scan could not be completed. Product remains unpublished." }, 502);
    }

    const allowed = ["application/zip", "application/pdf", "application/vnd.android.package-archive", "application/octet-stream"];
    const mimeOkay = allowed.includes(result.detected_mime);
    const scanStatus = result.clean && mimeOkay ? "clean" : result.clean ? "unsupported" : "infected";
    const update = await db.from("products").update({
      scan_status: scanStatus,
      file_sha256: result.sha256.toLowerCase(),
      file_size_bytes: result.size_bytes,
      detected_mime: result.detected_mime,
      scan_provider: result.engine.slice(0, 80),
      scanned_at: new Date().toISOString()
    }).eq("id", product_id);
    if (update.error) throw update.error;

    return json({
      product_id,
      scan_status: scanStatus,
      message: scanStatus === "clean"
        ? "File passed malware scanning and content-type verification. It is ready for administrator review."
        : scanStatus === "infected"
          ? "Malware was detected. The product must not be published."
          : "The file type is not supported. The product must not be published."
    }, scanStatus === "clean" ? 200 : 422);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "File verification failed" }, 400);
  }
});
