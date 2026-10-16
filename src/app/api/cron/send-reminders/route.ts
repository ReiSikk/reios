import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/db";

type Reminder = { id: string; task_id: string; remind_at: string };
type Task = { id: string; title: string; category: string | null; due_date: string | null };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function emailBody(task: Task): { html: string; text: string } {
  const title = escapeHtml(task.title);
  const category = task.category ? `<p>Category: ${escapeHtml(task.category)}</p>` : "";
  const dueDate = task.due_date ? `<p>Due date: ${escapeHtml(task.due_date)}</p>` : "";
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
  const link = `${escapeHtml(appUrl)}/`;
  return {
    html: `<p>This is a reminder for <strong>${title}</strong>.</p>${category}${dueDate}<p><a href="${link}">Open REIOS</a></p>`,
    text: [
      `Task reminder: ${task.title}`,
      task.category ? `Category: ${task.category}` : "",
      task.due_date ? `Due date: ${task.due_date}` : "",
      `Open REIOS: ${appUrl}/`,
    ].filter(Boolean).join("\n"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "Cron is not configured." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL?.trim();
  if (!ownerEmail || !resendKey || !resendFrom) {
    return Response.json({ error: "Reminder email is not configured." }, { status: 500 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const staleClaimBefore = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const { data: dueReminders, error: reminderError } = await supabase
    .from("reminders")
    .select("id,task_id,remind_at")
    .lte("remind_at", nowIso)
    .is("sent_at", null)
    .order("remind_at", { ascending: true })
    .limit(100);

  if (reminderError) return Response.json({ error: "Could not load due reminders." }, { status: 500 });
  if (!dueReminders?.length) return Response.json({ sent: 0, failed: 0 });

  const taskIds = [...new Set(dueReminders.map((reminder) => reminder.task_id))];
  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .select("id,title,category,due_date")
    .in("id", taskIds)
    .eq("done", false);
  if (taskError) return Response.json({ error: "Could not load reminder tasks." }, { status: 500 });

  const taskById = new Map((tasks ?? []).map((task) => [task.id, task as Task]));
  const resend = new Resend(resendKey);
  let sent = 0;
  let failed = 0;

  for (const reminder of dueReminders as Reminder[]) {
    const task = taskById.get(reminder.task_id);
    if (!task) continue;

    const { data: claim, error: claimError } = await supabase
      .from("reminders")
      .update({ processing_at: nowIso })
      .eq("id", reminder.id)
      .is("sent_at", null)
      .or(`processing_at.is.null,processing_at.lt.${staleClaimBefore}`)
      .select("id")
      .maybeSingle();

    if (claimError) {
      failed += 1;
      continue;
    }
    if (!claim) continue;

    try {
      const content = emailBody(task);
      const { error: sendError } = await resend.emails.send({
        from: resendFrom,
        to: ownerEmail,
        subject: `Task reminder: ${task.title}`,
        ...content,
      }, { idempotencyKey: `task-reminder/${reminder.id}` });

      if (sendError) {
        failed += 1;
        await supabase.from("reminders").update({ processing_at: null }).eq("id", reminder.id).is("sent_at", null);
        continue;
      }

      const { error: sentError } = await supabase
        .from("reminders")
        .update({ sent_at: new Date().toISOString(), processing_at: null })
        .eq("id", reminder.id)
        .is("sent_at", null);
      if (sentError) {
        failed += 1;
        continue;
      }
      sent += 1;
    } catch {
      failed += 1;
      await supabase.from("reminders").update({ processing_at: null }).eq("id", reminder.id).is("sent_at", null);
    }
  }

  return Response.json({ sent, failed }, { status: failed ? 500 : 200 });
}
