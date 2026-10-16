alter table public.reminders
  add column processing_at timestamptz;

create index reminders_processing_at_idx
  on public.reminders (processing_at)
  where sent_at is null;
