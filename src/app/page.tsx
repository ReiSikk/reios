import { Suspense } from "react";
import { requireOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/db";
import { Dashboard } from "@/components/dashboard";
import { getImportantEmails } from "@/lib/integrations/gmail";

export default function Home() {
  return (
    <Suspense fallback={<main className="min-h-screen p-8 text-sm text-muted-foreground">Loading REIOS…</main>}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const owner = await requireOwner();
  const supabase = getSupabaseAdmin();
  const [tasksResult, remindersResult, gmail] = await Promise.all([
    supabase.from("tasks").select("id,list,title,category,due_date,done,created_at").order("created_at", { ascending: true }),
    supabase.from("reminders").select("task_id,remind_at").is("sent_at", null).order("created_at", { ascending: false }),
    getImportantEmails(),
  ]);

  const tasks = tasksResult.error ? [] : tasksResult.data ?? [];
  const reminders = remindersResult.error ? [] : remindersResult.data ?? [];
  const reminderByTask = new Map<string, string>();
  for (const reminder of reminders) {
    if (!reminderByTask.has(reminder.task_id)) reminderByTask.set(reminder.task_id, reminder.remind_at);
  }

  return (
    <Dashboard
      ownerName={owner.name ?? "Rei"}
      tasks={tasks.map((task) => ({ ...task, reminderAt: reminderByTask.get(task.id) ?? null }))}
      hasTaskError={Boolean(tasksResult.error)}
      hasReminderError={Boolean(remindersResult.error)}
      gmail={gmail}
    />
  );
}
