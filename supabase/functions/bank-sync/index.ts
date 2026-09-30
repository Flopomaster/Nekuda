// API for the nightly bank-sync worker (GitHub Actions). Authenticated by a token whose
// SHA-256 hash is stored in private.config; the worker never gets database credentials.
//   { action: "list" }   -> connections (still encrypted) + each user's categories and history
//   { action: "report" } -> results for one connection: new transactions, or an error
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Row = {
  kind: "expense" | "income";
  amount: number;
  occurred_on: string;
  merchant: string | null;
  category_id: string | null;
  payment_method_id: string | null;
  note: string | null;
  external_id: string;
};

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: expected } = await supabase.rpc("get_sync_token_hash");
  const token = req.headers.get("x-sync-token") ?? "";
  if (!expected || !token || !timingSafeEqual(await sha256Hex(token), expected)) {
    return new Response("forbidden", { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === "list") {
    const { data: connections, error } = await supabase.from("bank_connections")
      .select("id, user_id, company, encrypted_credentials, last_success_at");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const userIds = [...new Set((connections ?? []).map((c) => c.user_id))];
    const users: Record<string, unknown> = {};
    for (const uid of userIds) {
      const [cats, pays, txs] = await Promise.all([
        supabase.from("categories").select("id, kind, name, icon, sort, archived").eq("user_id", uid),
        supabase.from("payment_methods").select("id, name, sort, archived").eq("user_id", uid),
        supabase.from("transactions").select("id, kind, amount, occurred_on, merchant, category_id, external_id")
          .eq("user_id", uid).order("occurred_on", { ascending: false }).limit(5000),
      ]);
      users[uid] = {
        categories: cats.data ?? [],
        payment_methods: pays.data ?? [],
        transactions: (txs.data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })),
      };
    }
    return Response.json({ connections: connections ?? [], users });
  }

  if (body.action === "report") {
    const { data: conn } = await supabase.from("bank_connections")
      .select("id, user_id, company, label, status").eq("id", body.connection_id).maybeSingle();
    if (!conn) return Response.json({ error: "unknown connection" }, { status: 404 });
    const now = new Date().toISOString();

    if (!body.ok) {
      const message = String(body.error ?? "שגיאה לא ידועה").slice(0, 500);
      await supabase.from("bank_connections")
        .update({ status: "error", last_error: message, last_sync_at: now }).eq("id", conn.id);
      await notify(supabase, conn.user_id, "⚠️ עדכון מהבנק נכשל", `${conn.label ?? conn.company}: ${message}`);
      return Response.json({ ok: true });
    }

    // Only accept categories and payment methods that belong to this user
    const [{ data: cats }, { data: pays }] = await Promise.all([
      supabase.from("categories").select("id").eq("user_id", conn.user_id),
      supabase.from("payment_methods").select("id").eq("user_id", conn.user_id),
    ]);
    const catIds = new Set((cats ?? []).map((c) => c.id));
    const payIds = new Set((pays ?? []).map((p) => p.id));
    const rows = ((body.rows ?? []) as Row[])
      .filter((r) => (r.kind === "expense" || r.kind === "income") && r.amount > 0 &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.occurred_on) && typeof r.external_id === "string" && r.external_id)
      .map((r) => ({
        user_id: conn.user_id,
        kind: r.kind,
        amount: Math.round(r.amount * 100) / 100,
        occurred_on: r.occurred_on,
        merchant: r.merchant?.slice(0, 200) ?? null,
        category_id: r.category_id && catIds.has(r.category_id) ? r.category_id : null,
        payment_method_id: r.payment_method_id && payIds.has(r.payment_method_id) ? r.payment_method_id : null,
        note: r.note?.slice(0, 500) ?? null,
        external_id: r.external_id.slice(0, 300),
      }));

    let added = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await supabase.from("transactions")
        .upsert(rows.slice(i, i + 200), { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
      if (error) return Response.json({ error: error.message }, { status: 500 });
      added += data?.length ?? 0;
    }
    await supabase.from("bank_connections").update({
      status: "ok", last_error: null, last_sync_at: now, last_success_at: now, last_added: added,
    }).eq("id", conn.id);
    return Response.json({ ok: true, added });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
});

async function notify(supabase: ReturnType<typeof createClient>, userId: string, title: string, body: string) {
  const { data: cfgRows } = await supabase.rpc("get_push_config");
  const cfg = cfgRows?.[0];
  if (!cfg) return;
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url: "/settings" }),
      );
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await supabase.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
}
