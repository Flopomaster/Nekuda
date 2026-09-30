// Runs every minute (pg_cron -> pg_net). Sends Web Push reminders for tasks
// whose reminder time has arrived, plus one evening summary of overdue tasks.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Task = {
  id: string;
  user_id: string;
  title: string;
  recurrence: "once" | "daily" | "weekly" | "monthly";
  due_date: string | null;
  start_date: string;
  weekdays: number[];
  month_day: number | null;
  reminder_time: string | null;
};

// How far back a missed reminder is still worth sending (e.g. after downtime)
const REMINDER_GRACE_MIN = 30;

function localNow(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Mirrors occursOn() in src/lib/recurrence.ts
function occursOn(task: Task, date: string): boolean {
  if (task.recurrence === "once") return task.due_date === date;
  if (date < task.start_date) return false;
  const d = new Date(`${date}T12:00:00Z`);
  if (task.recurrence === "daily") return true;
  if (task.recurrence === "weekly") return task.weekdays.includes(d.getUTCDay());
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === Math.min(task.month_day ?? 1, lastDay);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: cfgRows, error: cfgErr } = await supabase.rpc("get_push_config");
  const cfg = cfgRows?.[0];
  if (cfgErr || !cfg) return new Response("config missing", { status: 500 });
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

  if (req.headers.get("x-cron-secret") !== cfg.cron_secret) {
    // Not the scheduler: allow a signed-in user to send themselves a test push
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!auth.user) return new Response("forbidden", { status: 403, headers: CORS });
    const { data: subs } = await supabase.from("push_subscriptions")
      .select("endpoint, p256dh, auth").eq("user_id", auth.user.id);
    let ok = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: "נקודה ✨", body: "ההתראות עובדות!", url: "/" }),
        );
        ok++;
      } catch (e) {
        console.error("test push failed", (e as Error).message);
      }
    }
    return Response.json({ sent: ok, devices: subs?.length ?? 0 }, { headers: CORS });
  }

  const { data: users } = await supabase.from("settings").select("user_id, timezone, evening_reminder_time");
  let sent = 0;

  for (const user of users ?? []) {
    const { data: subs } = await supabase.from("push_subscriptions")
      .select("id, endpoint, p256dh, auth").eq("user_id", user.user_id);
    if (!subs?.length) continue;

    const now = localNow(user.timezone);
    const { data: tasks } = await supabase.from("tasks")
      .select("id, user_id, title, recurrence, due_date, start_date, weekdays, month_day, reminder_time")
      .eq("user_id", user.user_id).eq("archived", false);
    const { data: doneRows } = await supabase.from("task_completions")
      .select("task_id, occurrence_date").eq("user_id", user.user_id).eq("done", true)
      .gte("occurrence_date", addDays(now.date, -60));
    const done = new Set((doneRows ?? []).map((r) => `${r.task_id}:${r.occurrence_date}`));

    const notifications: { key: string; title: string; body: string; url: string }[] = [];

    // 1) Reminders due now
    for (const t of (tasks ?? []) as Task[]) {
      if (!t.reminder_time || !occursOn(t, now.date) || done.has(`${t.id}:${now.date}`)) continue;
      const due = toMinutes(t.reminder_time);
      if (now.minutes >= due && now.minutes - due <= REMINDER_GRACE_MIN) {
        notifications.push({
          key: `reminder:${t.id}:${now.date}`,
          title: "⏰ תזכורת",
          body: t.title,
          url: "/tasks",
        });
      }
    }

    // 2) Evening summary of overdue tasks
    const evening = toMinutes(user.evening_reminder_time);
    if (now.minutes >= evening && now.minutes - evening <= REMINDER_GRACE_MIN) {
      const overdue = ((tasks ?? []) as Task[]).filter((t) => {
        if (t.recurrence === "once") return !!t.due_date && t.due_date <= now.date && !done.has(`${t.id}:${t.due_date}`);
        return occursOn(t, now.date) && !done.has(`${t.id}:${now.date}`) &&
          !!t.reminder_time && toMinutes(t.reminder_time) <= now.minutes;
      });
      if (overdue.length) {
        const names = overdue.slice(0, 3).map((t) => t.title).join(", ");
        notifications.push({
          key: `overdue:${user.user_id}:${now.date}`,
          title: `🔴 ${overdue.length} משימות באיחור`,
          body: overdue.length > 3 ? `${names} ועוד ${overdue.length - 3}` : names,
          url: "/tasks",
        });
      }
    }

    for (const n of notifications) {
      // Claim the key first so parallel/overlapping runs never double-send
      const { error: claimErr } = await supabase.from("notification_log")
        .insert({ key: n.key, user_id: user.user_id });
      if (claimErr) continue;
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key }),
            { TTL: 60 * 60 },
          );
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", s.id);
          } else {
            console.error("push failed", status, (e as Error).message);
          }
        }
      }
    }
  }

  // Keep the dedupe log small
  await supabase.from("notification_log").delete()
    .lt("sent_at", new Date(Date.now() - 7 * 864e5).toISOString());

  return Response.json({ sent });
});

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
