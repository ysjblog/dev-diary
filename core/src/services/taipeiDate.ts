export function taipeiDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** SQLite expression for assigning an ISO timestamp to its Asia/Taipei calendar day. */
export function sqliteTaipeiDate(column: string): string {
  return `date(${column}, '+8 hours')`;
}

/** SQLite expression for assigning an ISO timestamp to its Asia/Taipei wall-clock hour. */
export function sqliteTaipeiHour(column: string): string {
  return `strftime('%H', ${column}, '+8 hours')`;
}
