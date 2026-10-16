"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/db";

const taskSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  list: z.enum(["home_admin", "todo"]),
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  remind_at: z.string().max(32).optional().or(z.literal("")),
});

const taskIdSchema = z.string().uuid();

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function saveTask(formData: FormData): Promise<void> {
  await requireOwner();
  const parsed = taskSchema.safeParse({
    id: formValue(formData, "id"),
    list: formValue(formData, "list"),
    title: formValue(formData, "title"),
    category: formValue(formData, "category"),
    due_date: formValue(formData, "due_date"),
    remind_at: formValue(formData, "remind_at"),
  });

  if (!parsed.success) throw new Error("Please check the task details and try again.");
  const { id, list, title, category, due_date, remind_at } = parsed.data;
  const remindAt = remind_at ? new Date(remind_at) : null;
  if (remindAt && Number.isNaN(remindAt.getTime())) throw new Error("Choose a valid reminder time.");
  const supabase = getSupabaseAdmin();
  const taskValues = {
    list,
    title,
    category: category || null,
    due_date: due_date || null,
    updated_at: new Date().toISOString(),
  };

  let taskId = id || "";
  if (id) {
    const { data, error } = await supabase.from("tasks").update(taskValues).eq("id", id).select("id").single();
    if (error) throw new Error("Could not update this task.");
    taskId = data.id;
  } else {
    const { data, error } = await supabase.from("tasks").insert(taskValues).select("id").single();
    if (error) throw new Error("Could not create this task.");
    taskId = data.id;
  }

  if (remindAt) {
    const { data: existing, error: readError } = await supabase
      .from("reminders")
      .select("id")
      .eq("task_id", taskId)
      .is("sent_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error("Could not save the reminder.");
    const result = existing
      ? await supabase.from("reminders").update({ remind_at: remindAt.toISOString() }).eq("id", existing.id)
      : await supabase.from("reminders").insert({ task_id: taskId, remind_at: remindAt.toISOString() });
    if (result.error) throw new Error("Could not save the reminder.");
  } else if (id) {
    const { error } = await supabase.from("reminders").delete().eq("task_id", taskId).is("sent_at", null);
    if (error) throw new Error("Could not remove the reminder.");
  }

  revalidatePath("/");
}

export async function toggleTask(taskId: string): Promise<void> {
  await requireOwner();
  const id = taskIdSchema.parse(taskId);
  const supabase = getSupabaseAdmin();
  const { data: task, error: readError } = await supabase.from("tasks").select("done").eq("id", id).single();
  if (readError) throw new Error("Could not find this task.");
  const done = !task.done;
  const { error } = await supabase
    .from("tasks")
    .update({ done, completed_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("Could not update this task.");
  revalidatePath("/");
}

export async function deleteTask(taskId: string): Promise<void> {
  await requireOwner();
  const id = taskIdSchema.parse(taskId);
  const { error } = await getSupabaseAdmin().from("tasks").delete().eq("id", id);
  if (error) throw new Error("Could not delete this task.");
  revalidatePath("/");
}
