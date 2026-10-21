export const GMAIL_IMPORTANCE_QUERY = "is:unread (is:important OR category:primary) newer_than:7d";
export const GMAIL_MESSAGE_LIMIT = 5;
export const GMAIL_INVOICE_QUERY = "newer_than:90d {arve invoice}";
export const GMAIL_INVOICE_LIMIT = 12;
export const GMAIL_CACHE_MS = 3 * 60 * 1000;
