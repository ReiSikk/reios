<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — REIOS (Rei's operating system)

You are implementing **REIOS**, a single-user personal admin dashboard. Follow this file exactly. Work through the phases in order, one phase at a time. Do not skip ahead, do not add libraries or features that are not listed here, and ask the owner before deviating from the stack or architecture.

## 1. Product summary

A private dashboard for one person (the owner). Modules:

1. **Home Admin**: task list for household and personal admin (categories such as Home maintenance, Household, Safety). Tasks have a due date and optional email reminders.
2. **To-Do List**: general task list (Errands, Admin, Social, ...). Same data model as Home Admin, separated by a `list` column.
3. **Google Inbox and Invoices**: shows the most important emails and recent invoice matches from the owner's Gmail (read-only).
4. **Calendar Preview**: 8-day preview strip (see design). Show read-only events from the owner's Google Calendar list plus task due dates.
5. **Email reminders**: scheduled emails sent to the owner's own inbox for tasks with reminders.

Static text (titles, subtitles, labels) lives in code. **No CMS.** Do not build any content-editing UI.

## 2. Fixed tech stack (do not change)

- **Next.js** (App Router) + **TypeScript** (`strict: true`)
- **Tailwind CSS** + **shadcn/ui** (Radix primitives), `lucide-react` for icons, and Motion for React animations
- **Auth.js (next-auth v5)** with the **Google provider**, restricted to the owner's email
- **Supabase** used as a hosted **Postgres database only** (not Supabase Auth). Access via `@supabase/supabase-js` on the server.
- **Resend** for transactional email
- **zod** for input validation
- **Scheduled jobs**: a protected route handler triggered by a cron (Vercel Cron by default; see Phase 3)
- Package manager: **npm**
- Hosting target: Vercel (unless the owner says otherwise)

## 3. Design source

The visual design comes from a Figma prototype. **The owner will provide a Figma MCP link/context. Do not start UI work (Phase 2 onward) until you have it.** When you have it:

- Figma MCP server configured in Codex: `https://mcp.figma.com/mcp` (server name: `figma`).
- Design source for Phase 2: [Nils Veeb, frame 33-268](https://www.figma.com/design/u6d969g9PgpaYEVhilWcCF/Nils-Veeb?node-id=33-268&t=kmXI9cPKPYERj4XX-1).
- Before building Phase 2 screens, read this frame through the `figma` MCP and tell Codex to use it as the visual design source.

- Read the Figma frames through the MCP before building each screen. Match layout, spacing, typography, colors and states.
- Extract design tokens (colors, radii, font sizes) into Tailwind theme/CSS variables once, then reuse them.
- If the Figma context conflicts with this file about **behavior or architecture**, this file wins. If it conflicts about **visuals**, Figma wins.
- If something is missing from Figma, ask rather than inventing a new design.

Reference of what the prototype shows (dark theme, rounded cards): header with logo "REIOS" and user pill ("Rei / Admin"); **Home Admin** and **To-Do List** cards (task rows with checkbox, title, category • due label, reminder/edit/delete icon buttons, "Add task" button); **Google Inbox** card (sender • subject, category • time ago, Unread badge, "3 unread"); and **Calendar Preview** (8-day grid, today highlighted).

## 4. Architecture rules

- Server-first: use React Server Components for reads, **Server Actions** for mutations. Use route handlers only for OAuth callbacks, webhooks and cron.
- **All database access happens on the server** using the Supabase **service role key**. The service role key and all tokens must never reach the client bundle (no `NEXT_PUBLIC_` prefix, no imports from client components).
- Enable **Row Level Security on every table with no permissive policies** (deny all for anon/authenticated roles). The server uses the service role, which bypasses RLS. This keeps the DB closed if the anon key ever leaks.
- Every page, server action and route handler (except the cron route, which uses a secret) must check the session and verify the email equals `OWNER_EMAIL`. Centralize this in one `requireOwner()` helper.
- Validate all inputs with zod. Never trust client-provided IDs without checking ownership (single user, but keep the habit).
- Store the Google OAuth tokens **encrypted** (AES-256-GCM, key from `ENCRYPTION_KEY`) in the `integrations` table.
- Keep integration code isolated in `src/lib/integrations/{gmail,calendar}/`. UI components never call external APIs directly.
- Handle empty, loading and error states for every card (a failed Gmail call must not break the dashboard).
- No `any`. No unused dependencies. Run `npm run lint` and `npm run typecheck` before finishing each phase.

## 5. Suggested folder structure

```
src/
  app/
    (dashboard)/page.tsx        # main dashboard
    login/page.tsx
    api/
      auth/[...nextauth]/route.ts
      cron/send-reminders/route.ts
  components/                   # ui/ (shadcn) + feature components
  lib/
    auth.ts                     # Auth.js config + requireOwner()
    db.ts                       # server-only Supabase client
    crypto.ts                   # encrypt/decrypt tokens
    email.ts                    # Resend wrapper + templates
    integrations/gmail/
    integrations/calendar/
    tasks/                      # queries + server actions
supabase/
  migrations/
```

Add `import "server-only"` to `db.ts`, `crypto.ts` and the integrations.

## 6. Data model (Supabase Postgres)

Create via SQL migrations in `supabase/migrations/`, never by clicking in the dashboard.

- `tasks`: `id uuid pk default gen_random_uuid()`, `list text check (list in ('home_admin','todo'))`, `title text not null`, `category text`, `due_date date`, `done boolean default false`, `completed_at timestamptz`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- `reminders`: `id uuid pk`, `task_id uuid references tasks on delete cascade`, `remind_at timestamptz not null`, `sent_at timestamptz`, `created_at timestamptz default now()`; index on `(sent_at, remind_at)`
- `integrations`: `provider text pk` (`google`), `access_token_enc text`, `refresh_token_enc text`, `expires_at timestamptz`, `scope text`, `updated_at timestamptz`
- Optional later: `email_rules` for Gmail importance (VIP senders, keywords).

Enable RLS on all of them.

## 7. Environment variables

Provide `.env.example` (committed, no secrets) and `.env.local` (git-ignored):

```
OWNER_EMAIL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
ENCRYPTION_KEY=          # 32 bytes, base64
CRON_SECRET=
APP_URL=http://localhost:3000
```

Never print, log or commit secret values.

## 8. Implementation phases

Complete one phase, run lint + typecheck + manual verification, commit, then stop and report before starting the next phase. Use small, conventional commits (`feat:`, `fix:`, `chore:`).

### Phase 0: Foundation

- Confirm the Next.js + TypeScript + Tailwind project builds. Install shadcn/ui, `zod`, `@supabase/supabase-js`, `resend`, `next-auth@beta`, `lucide-react`.
- Add `typecheck` script, `.env.example`, strict TS, ESLint, Prettier (optional).
- Set up Supabase CLI migrations (`supabase/`) and the first migration with all tables from section 6 plus RLS.
- **Done when**: app runs, migration applies to the Supabase project, `npm run build` passes.

### Phase 1: Authentication

- Auth.js with Google provider, `access_type=offline`, `prompt=consent`, scopes `openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
- `signIn` callback rejects any email that is not `OWNER_EMAIL`.
- On sign-in, store the Google refresh/access token encrypted in `integrations`.
- Middleware protects everything except `/login` and the cron routes. Implement `requireOwner()`.
- **Done when**: only the owner can log in; others are rejected; unauthenticated visits redirect to `/login`.

### Phase 2: Tasks (Home Admin + To-Do)

_(Requires the Figma context.)_

- Build the dashboard shell (header, user pill, grid) from Figma.
- Implement both task cards using the shared `tasks` table: add, edit, toggle done, delete, due label ("Today", "Tomorrow", "This week", "Next Monday", dates).
- Add-task dialog with title, category, due date, list, optional reminder time.
- Use Server Actions with zod validation and `revalidatePath`. Optimistic UI for the checkbox is welcome.
- **Done when**: full CRUD works for both lists and persists in Supabase.

### Phase 3: Email reminders

- Bell icon opens a reminder picker; creates/updates/deletes rows in `reminders`.
- `GET /api/cron/send-reminders`: verifies `Authorization: Bearer ${CRON_SECRET}`; selects reminders with `remind_at <= now()` and `sent_at is null` for tasks that are not done; sends one email per reminder via Resend to `OWNER_EMAIL`; sets `sent_at` only after a successful send; is idempotent (safe to run twice).
- Email template: plain, minimal HTML with task title, category, due date and a link to the app.
- Configure the cron schedule in `vercel.json` to run once daily at `0 6 * * *` UTC for Vercel Hobby compatibility. Hobby cron timing can vary by up to an hour; tell the owner that a reminder can be delivered nearly 24 hours after its selected time.
- **Done when**: a reminder set a few minutes ahead arrives in the owner's inbox exactly once.

### Phase 4: Gmail important emails

- `src/lib/integrations/gmail`: fetch via Gmail API (`users.messages.list` with a query, then `messages.get` with `format=metadata` for From, Subject, Date, labels). Never fetch full bodies unless asked.
- `src/lib/integrations/calendar`: read events from the owner's primary Google Calendar using the read-only Calendar scope.
- Default importance query: `is:unread (is:important OR category:primary) newer_than:7d`. Keep the query and any VIP sender/keyword rules in one config file so the owner can edit it in code.
- Invoice query: `newer_than:90d {arve invoice}`; mark matching messages with an app-side Invoice label and list them on the dashboard. Do not infer whether an invoice is paid from read state.
- Show sender, subject, category label, relative time, unread badge and total unread count. Clicking opens the message in Gmail in a new tab.
- Cache results briefly (e.g. 2-5 minutes) to avoid hammering the API. The integration is **read-only**: no sending, deleting or modifying mail.
- **Done when**: the card shows real important emails and degrades gracefully if the token is revoked (show a "Reconnect Google" button).

### Phase 5: Calendar preview, polish, deploy

- Calendar Preview: 8-day strip from today, today highlighted, entries from Google Calendar events and tasks due that day.
- Responsive layout (mobile first check), accessible labels on icon buttons, keyboard focus states.
- Write `README.md`: setup, env vars, Google Cloud / Supabase / Resend setup, deploy steps.
- Deploy to Vercel, set env vars, set cron, test production end to end.
- **Done when**: the app is live, secured, and all modules work in production.

## 9. Quality and safety checklist (before each commit)

- [ ] `npm run lint`, `npm run typecheck`, `npm run build` pass
- [ ] No secrets in code, logs or git history
- [ ] No service-role or token usage in client components
- [ ] Every mutation validated with zod and guarded by `requireOwner()`
- [ ] Empty/loading/error states handled
- [ ] Migration files added for any schema change

## 10. Communication rules for the agent

- At the end of each phase, summarize what changed, what was verified, and anything the owner must do manually (creating OAuth clients, setting env vars, enabling APIs).
- If a requirement is ambiguous, ask a short question instead of guessing.
- Do not refactor unrelated code or restructure the project without asking.
