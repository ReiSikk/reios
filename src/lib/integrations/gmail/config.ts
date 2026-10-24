export const GMAIL_IMPORTANCE_QUERY = 'is:unread (is:important OR category:primary) newer_than:7d';
export const GMAIL_MESSAGE_LIMIT = 5;
export const GMAIL_INVOICE_QUERY = 'newer_than:90d {arve invoice}';
export const GMAIL_INVOICE_LIMIT = 100;
export const INVOICE_SENDER_FILTER = {
  // Add the companies whose bills you personally pay. Match against the Gmail From header.
  companyNames: ['elisa', 'go3', 'telia', 'google', 'apple'],
  // Optional extra sender fragments, such as a billing address or sender-domain keyword.
  senderKeywords: [] as string[],
};
export const INVOICE_DISPLAY_LIMIT = 12;
export const GMAIL_CACHE_MS = 3 * 60 * 1000;
