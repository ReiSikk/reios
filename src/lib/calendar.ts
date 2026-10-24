export const OWNER_TIME_ZONE = 'Europe/Tallinn';

export type CalendarItem = {
  id: string;
  title: string;
  done?: boolean;
  startsAt?: string;
  link?: string | null;
};
export type CalendarDay = {
  date: string;
  dayName: string;
  dayNumber: string;
  isToday: boolean;
  tasks: CalendarItem[];
};

type DueTask = { id: string; title: string; due_date: string | null; done: boolean };
type CalendarEvent = { id: string; title: string; startsAt: string; link: string | null };

function dateInOwnerZone(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OWNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function rangeLabel(firstDate: string, lastDate: string): string {
  const first = new Date(`${firstDate}T12:00:00Z`);
  const last = new Date(`${lastDate}T12:00:00Z`);
  const firstMonth = new Intl.DateTimeFormat('en-US', {
    timeZone: OWNER_TIME_ZONE,
    month: 'short',
  }).format(first);
  const lastMonth = new Intl.DateTimeFormat('en-US', {
    timeZone: OWNER_TIME_ZONE,
    month: 'short',
  }).format(last);
  const year = new Intl.DateTimeFormat('en-US', {
    timeZone: OWNER_TIME_ZONE,
    year: 'numeric',
  }).format(last);
  const firstDay = new Intl.DateTimeFormat('en-US', {
    timeZone: OWNER_TIME_ZONE,
    day: 'numeric',
  }).format(first);
  const lastDay = new Intl.DateTimeFormat('en-US', {
    timeZone: OWNER_TIME_ZONE,
    day: 'numeric',
  }).format(last);
  return firstMonth === lastMonth
    ? `${firstMonth} ${firstDay}–${lastDay}, ${year}`
    : `${firstMonth} ${firstDay}–${lastMonth} ${lastDay}, ${year}`;
}

export function buildCalendarPreview(
  tasks: DueTask[],
  events: CalendarEvent[] = [],
  now = new Date()
): { days: CalendarDay[]; range: string } {
  const today = dateInOwnerZone(now);
  const todayKey = dateKey(today.year, today.month, today.day);
  const dueTasks = new Map<string, CalendarItem[]>();
  for (const event of events) {
    const eventParts =
      event.startsAt.length === 10 ? null : dateInOwnerZone(new Date(event.startsAt));
    const eventDate = eventParts
      ? dateKey(eventParts.year, eventParts.month, eventParts.day)
      : event.startsAt;
    const dayItems = dueTasks.get(eventDate) ?? [];
    dayItems.push({
      id: `event-${event.id}`,
      title: event.title,
      startsAt: event.startsAt,
      link: event.link,
    });
    dueTasks.set(eventDate, dayItems);
  }
  for (const task of tasks) {
    if (!task.due_date) continue;
    const dayItems = dueTasks.get(task.due_date) ?? [];
    dayItems.push({ id: `task-${task.id}`, title: task.title, done: task.done });
    dueTasks.set(task.due_date, dayItems);
  }

  const days = Array.from({ length: 8 }, (_, offset) => {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const key = dateKey(year, month, day);
    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: OWNER_TIME_ZONE,
      weekday: 'short',
    }).format(date);
    return {
      date: key,
      dayName,
      dayNumber: String(day),
      isToday: key === todayKey,
      tasks: dueTasks.get(key) ?? [],
    };
  });
  return { days, range: rangeLabel(days[0].date, days[days.length - 1].date) };
}
