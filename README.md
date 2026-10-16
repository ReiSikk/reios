# REIOS

REIOS is a private personal admin dashboard for one owner. It includes Home Admin and To-Do task lists, email reminders, a read-only Gmail inbox preview, and an eight-day task calendar.

## Requirements

- Node.js supported by the installed Next.js release
- npm
- A Supabase project with Postgres
- A Google OAuth client with the Gmail API enabled
- A Resend account and verified sender address
- A Vercel Pro project for the configured 15-minute reminder schedule; Vercel Hobby supports one cron run per day, so use a daily schedule there instead

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the values below.
3. Link the Supabase CLI to the project and apply migrations with `npx supabase link` followed by `npx supabase db push`.
4. Start the app with `npm run dev`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `OWNER_EMAIL` | The only Google account allowed to sign in; use the same address for reminder delivery. |
| `AUTH_SECRET` | Auth.js session encryption secret. |
| `AUTH_GOOGLE_ID` | Google OAuth client ID. |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key. Never expose it to browser code. |
| `RESEND_API_KEY` | Resend API key used for task reminders. |
| `RESEND_FROM_EMAIL` | Verified sender address in Resend. |
| `ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes for encrypted Google tokens. |
| `CRON_SECRET` | Random secret used to protect `/api/cron/send-reminders`. |
| `APP_URL` | Public app URL used in reminder emails. |

Generate `AUTH_SECRET` with `openssl rand -base64 32`, and generate `ENCRYPTION_KEY` with `openssl rand -base64 32`. Keep `.env.local` out of version control.

## Service setup

### Supabase

Use the project URL and service role key as server configuration. All tables are managed by SQL migrations under `supabase/migrations/`; apply them with the Supabase CLI. RLS is enabled without permissive client policies. The application uses the service role key only from server code.

### Google Cloud

Create an OAuth client for the application, enable the Gmail API, and add the Auth.js callback URL:

`https://YOUR_APP_URL/api/auth/callback/google`

For local development, also add:

`http://localhost:3000/api/auth/callback/google`

The application requests `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/gmail.readonly`. Set `OWNER_EMAIL` to the account that should be allowed through the sign-in callback. Google access and refresh tokens are encrypted before storage. The Gmail integration reads message metadata only; it does not read message bodies or modify mail.

### Resend

Verify the sender domain or address in Resend, then set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Reminder emails go only to `OWNER_EMAIL`.

## Verification commands

```sh
npm run lint
npm run typecheck
npm run build
```

## Deploy to Vercel

1. Import the repository into Vercel.
2. Add every required environment variable from `.env.example` to the Production environment.
3. Use a Vercel Pro plan for the committed `*/15 * * * *` reminder schedule. Hobby projects can run a cron only once per day, with up to an hour of scheduling variance; for Hobby, change `vercel.json` to a daily schedule and expect reminders to be delayed until that run.
4. Deploy and confirm that the cron is listed under the project's Cron Jobs settings.
5. Sign in with the owner account, add a reminder a few minutes ahead, and verify it arrives once. Confirm that Gmail shows metadata, and that the calendar displays task due dates in the next eight days.

The cron endpoint expects `Authorization: Bearer ${CRON_SECRET}`. Vercel supplies this header to cron requests when `CRON_SECRET` is configured for the deployment.
