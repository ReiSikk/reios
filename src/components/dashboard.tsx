"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, Check, ChevronDown, Circle, Inbox, Pencil, Plus, Trash2, X } from "lucide-react";
import { deleteTask, saveTask, setTaskReminder, toggleTask } from "@/lib/tasks/actions";

type Task = {
  id: string;
  list: "home_admin" | "todo";
  title: string;
  category: string | null;
  due_date: string | null;
  done: boolean;
  reminderAt: string | null;
};

type GmailEmail = { id: string; sender: string; subject: string; category: string; receivedAt: string; unread: boolean };
type GmailInbox =
  | { status: "connected"; unreadCount: number; emails: GmailEmail[] }
  | { status: "reconnect" }
  | { status: "error" };
type GoogleCalendar =
  | { status: "connected"; events: { id: string; title: string; startsAt: string; link: string | null }[] }
  | { status: "reconnect" }
  | { status: "error" };
type CalendarPreviewDay = { date: string; dayName: string; dayNumber: string; isToday: boolean; tasks: { id: string; title: string; done?: boolean; startsAt?: string; link?: string | null }[] };
type DashboardProps = {
  ownerName: string;
  tasks: Task[];
  hasTaskError: boolean;
  hasReminderError: boolean;
  gmail: GmailInbox;
  googleCalendar: GoogleCalendar;
  calendarDays: CalendarPreviewDay[];
  calendarRange: string;
};

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

function relativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "recently";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Dashboard({ ownerName, tasks, hasTaskError, hasReminderError, gmail, googleCalendar, calendarDays, calendarRange }: DashboardProps) {
  const [dialogTask, setDialogTask] = useState<Task | null | undefined>(undefined);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
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

  async function submitReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reminderTask) return;
    const formData = new FormData(event.currentTarget);
    const remindAt = String(formData.get("remind_at") ?? "");
    startTransition(async () => {
      try {
        await setTaskReminder(reminderTask.id, remindAt);
        setReminderTask(null);
        setFormError("");
        router.refresh();
      } catch {
        setFormError("Could not save this reminder. Please try again.");
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
            <TaskList tasks={homeTasks} list="home_admin" onEdit={openEdit} onToggle={(id) => runTaskAction(() => toggleTask(id))} onDelete={(id) => runTaskAction(() => deleteTask(id))} onRemind={setReminderTask} />
            {hasTaskError && <p className="empty-note">Tasks could not be loaded. Please refresh to try again.</p>}
            {!hasTaskError && hasReminderError && <p className="empty-note">Reminder settings could not be loaded.</p>}
            {!hasTaskError && homeTasks.length === 0 && <p className="empty-note">No home tasks yet. Add one to get started.</p>}
          </section>

        </div>

        <div className="flex flex-col gap-5">
          <section className="dashboard-card inbox-card">
            <div className="section-heading compact"><h2><Inbox size={19} /> Google Inbox</h2><span className="accent-text">{gmail.status === "connected" ? `${gmail.unreadCount} unread` : "Inbox"}</span></div>
            {gmail.status === "connected" && gmail.emails.length > 0 && <div className="email-list">
              {gmail.emails.map((email) => <a className="email-row" key={email.id} href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(email.id)}`} target="_blank" rel="noreferrer">
                <span className="email-avatar" aria-hidden="true">{email.sender.trim().charAt(0).toUpperCase() || "?"}</span>
                <span className="email-copy"><b>{email.sender}</b><strong>{email.subject}</strong><small>{email.category} <i>•</i> {relativeTime(email.receivedAt)}</small></span>
                {email.unread && <span className="unread-badge">Unread</span>}
              </a>)}
            </div>}
            {gmail.status === "connected" && gmail.emails.length === 0 && <div className="integration-empty">No important unread emails right now.</div>}
            {gmail.status === "reconnect" && <div className="integration-state"><p>Google access expired or was revoked.</p><a className="secondary-pill" href="/login">Reconnect Google</a></div>}
            {gmail.status === "error" && <div className="integration-empty">Inbox is temporarily unavailable. Please refresh to try again.</div>}
          </section>
          <section className="dashboard-card calendar-card">
            <div className="section-heading compact"><h2><CalendarDays size={19} /> Calendar Preview</h2><span className="accent-text">{calendarRange}</span></div>
            {googleCalendar.status === "reconnect" && <p className="calendar-status">Connect Google Calendar to see events. <a href="/login">Reconnect Google</a></p>}
            {googleCalendar.status === "error" && <p className="calendar-status">Google Calendar is temporarily unavailable. Showing task due dates.</p>}
            {hasTaskError ? <div className="calendar-empty">Calendar tasks could not be loaded.</div> : <div className="calendar-grid" aria-label="Next eight days">
              {calendarDays.map((day) => <article className={`calendar-day ${day.isToday ? "is-today" : ""}`} key={day.date} aria-label={`${day.dayName}, ${day.date}${day.isToday ? ", today" : ""}`}>
                <span className="calendar-weekday">{day.dayName}</span>
                <strong>{day.dayNumber}</strong>
                {day.tasks.length > 0 ? <ul>
                  {day.tasks.slice(0, 2).map((task) => <li className={task.done ? "is-done" : ""} key={task.id}>
                    {task.link ? <a href={task.link} target="_blank" rel="noreferrer">{task.startsAt && task.startsAt.length > 10 ? `${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Tallinn", hour: "2-digit", minute: "2-digit" }).format(new Date(task.startsAt))} ` : ""}{task.title}</a> : task.title}
                  </li>)}
                  {day.tasks.length > 2 && <li className="calendar-more">+{day.tasks.length - 2} more</li>}
                </ul> : <span className="calendar-none">No tasks</span>}
              </article>)}
            </div>}
          </section>
          <section className="dashboard-card todo-card">
            <div className="section-heading compact"><h2>To-Do List</h2><button className="primary-pill" onClick={() => openNew("todo")}><Plus size={16} /> Add task</button></div>
            <TaskList tasks={todoTasks} list="todo" onEdit={openEdit} onToggle={(id) => runTaskAction(() => toggleTask(id))} onDelete={(id) => runTaskAction(() => deleteTask(id))} onRemind={openEdit} />
            {!hasTaskError && todoTasks.length === 0 && <p className="empty-note">No to-dos yet. Add one to get started.</p>}
            {hasTaskError && <p className="empty-note">Tasks could not be loaded. Please refresh to try again.</p>}
          </section>
        </div>
      </div>

      {formError && dialogTask === undefined && !reminderTask && <div className="dashboard-toast" role="status">{formError}<button onClick={() => setFormError("")} aria-label="Dismiss"><X size={15} /></button></div>}
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
      {reminderTask && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReminderTask(null); }}>
          <section className="task-dialog reminder-dialog" role="dialog" aria-modal="true" aria-labelledby="reminder-dialog-title">
            <form onSubmit={submitReminder}>
              <div className="dialog-content">
                <div className="dialog-eyebrow">REMINDER</div>
                <h2 id="reminder-dialog-title">Set a reminder</h2>
                <p className="dialog-description">We&apos;ll email you about “{reminderTask.title}”.</p>
                <label className="field-label" htmlFor="reminder-at">Remind me at</label>
                <div className="reminder-input-wrap"><input autoFocus id="reminder-at" name="remind_at" type="datetime-local" className="text-field" defaultValue={dateInput(reminderTask.reminderAt)} /><ChevronDown size={16} /></div>
                <p className="reminder-help">Reminders are checked once a day and may arrive up to 24 hours late. Leave blank to remove the pending reminder.</p>
                {formError && <p className="form-error" role="alert">{formError}</p>}
              </div>
              <div className="dialog-footer"><button type="button" className="secondary-pill" onClick={() => setReminderTask(null)}>Cancel</button><button type="submit" className="primary-pill" disabled={isPending}>{isPending ? "Saving…" : "Save reminder"}</button></div>
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
