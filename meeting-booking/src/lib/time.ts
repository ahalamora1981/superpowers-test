// Helper that formats a Date into a wall-clock "yyyy-MM-ddTHH:mm:ss" in a given IANA TZ.
function formatWallClock(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function localToUtc(localIso: string, timezone: string): string {
  const m = localIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`Invalid local ISO datetime: ${localIso}`);
  const [, y, mo, d, h, mi, s = '00'] = m;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const tzWallClockAtGuess = formatWallClock(new Date(guess), timezone);
  const tzGuess = Date.UTC(
    Number(tzWallClockAtGuess.slice(0, 4)),
    Number(tzWallClockAtGuess.slice(5, 7)) - 1,
    Number(tzWallClockAtGuess.slice(8, 10)),
    Number(tzWallClockAtGuess.slice(11, 13)),
    Number(tzWallClockAtGuess.slice(14, 16)),
    Number(tzWallClockAtGuess.slice(17, 19)),
  );
  const offset = tzGuess - guess;
  return new Date(guess - offset).toISOString();
}

export function utcToZoned(utcIso: string, timezone: string): string {
  return formatWallClock(new Date(utcIso), timezone);
}

export function formatInZone(utcIso: string, timezone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const { locale, ...rest } = opts as Intl.DateTimeFormatOptions & { locale?: string };
  return new Intl.DateTimeFormat(locale, { ...rest, timeZone: timezone }).format(new Date(utcIso));
}

export function weekStartMonday(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const day = out.getUTCDay();
  const delta = (day + 6) % 7;
  out.setUTCDate(out.getUTCDate() - delta);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
