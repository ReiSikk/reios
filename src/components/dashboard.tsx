"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, Check, ChevronDown, Circle, Dumbbell, Inbox, Pencil, Plus, Ruler, Trash2, X } from "lucide-react";
import { deleteTask, saveTask, toggleTask } from "@/lib/tasks/actions";

type Task = {
  id: string;
  list: "home_admin" | "todo";
  title: string;
  category: string | null;
  due_date: string | null;
  done: boolean;
  reminderAt: string | null;
};

type DashboardProps = { ownerName: string; tasks: Task[]; hasTaskError: boolean };

function dueLabel(date: string | null): string {
  if (!date) return "No due date";
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === tomorrow.getTime()) return "Tomorrow";
  if (target.getTime() === nextMonday.getTime()) return "Next Monday";
  if (target > today && target < new Date(today.getTime() + 7 * 86400000)) return "This week";
  return target.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function Dashboard({ ownerName, tasks, hasTaskError }: DashboardProps) {
  const [dialogTask, setDialogTask] = useState<Task | null | undefined>(undefined);
  const [dialogList, setDialogList] = useState<Task["list"]>("home_admin");
  const [formError, setFormError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function openNew(list: Task["list"]) {
    setDialogList(list);
    setDialogTask(null);
    setFormError("");
  }

  function openEdit(task: Task) {
    setDialogList(task.list);
    setDialogTask(task);
    setFormError("");
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await saveTask(formData);
        setDialogTask(undefined);
        router.refresh();
      } catch {
        setFormError("Could not save this task. Check the details and try again.");
      }
    });
  }

  function runTaskAction(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        setFormError("That change could not be saved. Please try again.");
      }
    });
  }

  const homeTasks = tasks.filter((task) => task.list === "home_admin");
  const todoTasks = tasks.filter((task) => task.list === "todo");

  return (
    <main className="dashboard-shell min-h-screen px-5 pb-10 pt-8 sm:px-8 lg:px-10">
      <header className="mx-auto mb-12 flex w-full max-w-[1480px] items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="brand-mark">R</div>
          <div>
            <div className="text-xl font-bold tracking-tight">REIOS</div>
            <div className="text-sm text-white/75">Rei&apos;s operating system</div>
          </div>
        </div>
        <div className="owner-pill"><span className="owner-avatar">R</span><span><b>{ownerName}</b><small>Admin</small></span></div>
      </header>

      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="flex flex-col gap-7">
          <section className="dashboard-card task-card">
            <div className="section-heading">
              <div><h1>Home Admin</h1><p>Personal task orchestration</p></div>
              <button className="primary-pill" onClick={() => openNew("home_admin")}><Plus size={16} /> Add task</button>
            </div>
            <TaskList tasks={homeTasks} list="home_admin" onEdit={openEdit} onToggle={(id) => runTaskAction(() => toggleTask(id))} onDelete={(id) => runTaskAction(() => deleteTask(id))} onRemind={openEdit} />
            {hasTaskError && <p className="empty-note">Tasks could not be loaded. Please refresh to try again.</p>}
            {!hasTaskError && homeTasks.length === 0 && <p className="empty-note">No home tasks yet. Add one to get started.</p>}
          </section>

          <section className="dashboard-card strava-card">
            <div className="section-heading compact"><h2><Dumbbell size={19} /> Strava Weekly</h2><span className="accent-text">This week</span></div>
            <div className="stats-grid">
              <Stat icon={<Ruler size={14} />} label="Distance" value="—" />
              <Stat icon={<CalendarDays size={14} />} label="Time" value="—" />
              <Stat icon={<Dumbbell size={14} />} label="Elevation" value="—" />
            </div>
            <div className="chart-caption"><b>Weekly activity</b><span>Strava setup pending</span></div>
            <div className="empty-chart" aria-label="Weekly activity chart will appear after Strava is connected"><i /><i /><i /><i /><i /><i /><i /></div>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="dashboard-card inbox-card">
            <div className="section-heading compact"><h2><Inbox size={19} /> Google Inbox</h2><span className="accent-text">— unread</span></div>
            <div className="integration-empty">Inbox preview will appear after Gmail is connected.</div>
          </section>
          <section className="dashboard-card calendar-card">
            <div className="section-heading compact"><h2><CalendarDays size={19} /> Calendar Preview</h2><span className="accent-text">Next 8 days</span></div>
            <div className="calendar-empty">Your upcoming task dates will appear here.</div>
          </section>
          <section className="dashboard-card todo-card">
            <div className="section-heading compact"><h2>To-Do List</h2><button className="primary-pill" onClick={() => openNew("todo")}><Plus size={16} /> Add task</button></div>
            <TaskList tasks={todoTasks} list="todo" onEdit={openEdit} onToggle={(id) => runTaskAction(() => toggleTask(id))} onDelete={(id) => runTaskAction(() => deleteTask(id))} onRemind={openEdit} />
            {!hasTaskError && todoTasks.length === 0 && <p className="empty-note">No to-dos yet. Add one to get started.</p>}
            {hasTaskError && <p className="empty-note">Tasks could not be loaded. Please refresh to try again.</p>}
          </section>
        </div>
      </div>

      {formError && dialogTask === undefined && <div className="dashboard-toast" role="status">{formError}<button onClick={() => setFormError("")} aria-label="Dismiss"><X size={15} /></button></div>}
      {dialogTask !== undefined && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogTask(undefined); }}>
          <section className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
            <form onSubmit={submitTask}>
              <input type="hidden" name="id" value={dialogTask?.id ?? ""} />
              <input type="hidden" name="list" value={dialogTask?.list ?? dialogList} />
              <div className="dialog-content">
                <div className="dialog-eyebrow">{dialogTask?.list === "todo" || (!dialogTask && dialogList === "todo") ? "TO-DO LIST" : "HOME ADMIN"}</div>
                <h2 id="task-dialog-title">{dialogTask ? "Edit task" : "Add task"}</h2>
                <p className="dialog-description">{dialogTask ? "Update the details. Keep life in order." : "Add a task and keep life in order."}</p>
                <label className="field-label" htmlFor="task-title">Task name</label>
                <input autoFocus id="task-title" name="title" className="text-field" maxLength={160} required defaultValue={dialogTask?.title ?? ""} placeholder="What needs to get done?" />
                <div className="field-pair">
                  <div><label className="field-label" htmlFor="task-category">Category</label><input id="task-category" name="category" className="text-field" maxLength={80} defaultValue={dialogTask?.category ?? ""} placeholder="e.g. Home maintenance" /></div>
                  <div><label className="field-label" htmlFor="task-due">Due date</label><input id="task-due" name="due_date" type="date" className="text-field" defaultValue={dialogTask?.due_date ?? ""} /></div>
                </div>
                <label className="field-label" htmlFor="task-reminder">Reminder</label>
                <div className="reminder-input-wrap"><input id="task-reminder" name="remind_at" type="datetime-local" className="text-field" defaultValue={dateInput(dialogTask?.reminderAt ?? null)} /><ChevronDown size={16} /></div>
                {formError && <p className="form-error" role="alert">{formError}</p>}
              </div>
              <div className="dialog-footer"><button type="button" className="secondary-pill" onClick={() => setDialogTask(undefined)}>Cancel</button><button type="submit" className="primary-pill" disabled={isPending}>{isPending ? "Saving…" : "Confirm"}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function TaskList({ tasks, list, onEdit, onToggle, onDelete, onRemind }: {
  tasks: Task[];
  list: Task["list"];
  onEdit: (task: Task) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onRemind: (task: Task) => void;
}) {
  return <div className={`task-list ${list === "todo" ? "todo-task-list" : ""}`}>
    {tasks.map((task) => <article key={task.id} className={`task-row ${task.done ? "is-done" : ""}`}>
      <button className="check-button" onClick={() => onToggle(task.id)} aria-label={task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}>
        {task.done ? <Check size={15} strokeWidth={3} /> : <Circle size={22} fill="currentColor" strokeWidth={0} />}
      </button>
      <button className="task-copy" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`}>
        <b>{task.title}</b><span>{task.category || "Uncategorized"} <i>•</i> {dueLabel(task.due_date)}</span>
      </button>
      {list === "home_admin" && <div className="task-actions">
        <button onClick={() => onRemind(task)} className={task.reminderAt ? "has-reminder" : ""} aria-label={`Set reminder for ${task.title}`}><Bell size={17} /></button>
        <button onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`}><Pencil size={17} /></button>
        <button onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`}><Trash2 size={17} /></button>
      </div>}
    </article>)}
  </div>;
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="stat-tile"><div><span>{icon}</span>{label}</div><strong>{value}</strong></div>;
}
