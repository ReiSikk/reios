import 'server-only';

import { z } from 'zod';
import { OWNER_TIME_ZONE } from '@/lib/calendar';
import { getGoogleAccessToken, RevokedGoogleToken } from '@/lib/integrations/google-token';

const eventListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string(),
            summary: z.string().optional(),
            start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }),
            htmlLink: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();
const calendarListSchema = z
  .object({
    items: z.array(z.object({ id: z.string() }).passthrough()).optional(),
  })
  .passthrough();

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  link: string | null;
};

export type GoogleCalendarResult =
  | { status: 'connected'; events: GoogleCalendarEvent[] }
  | { status: 'reconnect' }
  | { status: 'error' };

const CACHE_MS = 3 * 60 * 1000;
let cachedResult: GoogleCalendarResult | undefined;
let cachedUntil = 0;

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

function ownerMidnightUtc(year: number, month: number, day: number): string {
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: OWNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    const observed = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    );
    guess += target - observed;
  }
  return new Date(guess).toISOString();
}

function calendarBounds(now: Date): { timeMin: string; timeMax: string } {
  const today = dateInOwnerZone(now);
  const end = new Date(Date.UTC(today.year, today.month - 1, today.day + 8));
  return {
    timeMin: ownerMidnightUtc(today.year, today.month, today.day),
    timeMax: ownerMidnightUtc(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
  };
}

async function fetchEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<Response> {
  const query = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  return fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
    {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    }
  );
}

async function loadEvents(): Promise<GoogleCalendarResult> {
  const { timeMin, timeMax } = calendarBounds(new Date());
  let accessToken = await getGoogleAccessToken();
  const calendarListUrl =
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250';
  let calendarResponse = await fetch(calendarListUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (calendarResponse.status === 401) {
    accessToken = await getGoogleAccessToken(true);
    calendarResponse = await fetch(calendarListUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  }
  if (calendarResponse.status === 401 || calendarResponse.status === 403)
    throw new RevokedGoogleToken('Google Calendar access was rejected.');
  if (!calendarResponse.ok) throw new Error('Google Calendar list could not be loaded.');
  const calendarList = calendarListSchema.safeParse(await calendarResponse.json());
  if (!calendarList.success) throw new Error('Google returned an invalid calendar list.');

  const calendarIds = (calendarList.data.items ?? []).map((calendar) => calendar.id);
  let responses = await Promise.all(
    calendarIds.map((calendarId) => fetchEvents(accessToken, calendarId, timeMin, timeMax))
  );
  if (responses.some((response) => response.status === 401)) {
    accessToken = await getGoogleAccessToken(true);
    responses = await Promise.all(
      calendarIds.map((calendarId) => fetchEvents(accessToken, calendarId, timeMin, timeMax))
    );
  }
  if (responses.some((response) => response.status === 401 || response.status === 403))
    throw new RevokedGoogleToken('Google Calendar access was rejected.');
  if (responses.some((response) => !response.ok))
    throw new Error('Google Calendar events could not be loaded.');
  const eventResults = await Promise.all(
    responses.map(async (response) => eventListSchema.safeParse(await response.json()))
  );
  if (eventResults.some((result) => !result.success))
    throw new Error('Google Calendar returned invalid events.');

  return {
    status: 'connected',
    events: eventResults.flatMap((result, index) => {
      if (!result.success) return [];
      return (result.data.items ?? []).flatMap((event) => {
        const startsAt = event.start.dateTime ?? event.start.date;
        return startsAt
          ? [
              {
                id: `${calendarIds[index]}:${event.id}`,
                title: event.summary?.trim() || '(untitled event)',
                startsAt,
                link: event.htmlLink ?? null,
              },
            ]
          : [];
      });
    }),
  };
}

export async function getUpcomingCalendarEvents(): Promise<GoogleCalendarResult> {
  if (cachedResult && cachedUntil > Date.now()) return cachedResult;
  try {
    cachedResult = await loadEvents();
    cachedUntil = Date.now() + CACHE_MS;
  } catch (error) {
    cachedResult =
      error instanceof RevokedGoogleToken ? { status: 'reconnect' } : { status: 'error' };
    cachedUntil = Date.now() + (error instanceof RevokedGoogleToken ? CACHE_MS : 30_000);
  }
  return cachedResult;
}
