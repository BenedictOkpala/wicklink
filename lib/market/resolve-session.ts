import { isRecord } from '../bitget/normalize.ts';
import { normalizeSession, type MarketSession } from './session.ts';

export const SESSION_SOURCE = 'Bitget Reality schedule + calendar';
const ZONE = 'America/New_York';
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export interface SessionResolution {
  session: MarketSession;
  sessionSource: typeof SESSION_SOURCE;
  evaluatedAt: string | null;
  timeZone: typeof ZONE;
  localTime: string | null;
  reportedDaylightType: string | null;
  resolvedDaylightType: 'dst' | 'standard' | null;
  timezoneDiagnostic: string | null;
  calendarDate: string | null;
  sessionStartDate: string | null;
  sessionEndDate: string | null;
  issue: string | null;
}

function wallTime(utc: number): number {
  const parts = Object.fromEntries(formatter.formatToParts(utc).map(p => [p.type, p.value]));
  // UTC here is only an ordering representation of local calendar components.
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}

function minutes(value: unknown): number | null {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function closureTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return null;
  const stamp = Date.parse(value.replace(' ', 'T') + ':00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 16).replace('T', ' ') !== value) return null;
  return stamp;
}

function payload(value: unknown): unknown {
  if (!isRecord(value) || value.code !== '00000') return null;
  return value.data;
}

/** Pure function: provider envelopes and injected UTC epoch milliseconds only. */
export function resolveSession(statesBody: unknown, calendarBody: unknown, nowUtc: number): SessionResolution {
  const result: SessionResolution = {
    session: 'UNKNOWN', sessionSource: SESSION_SOURCE, evaluatedAt: null, timeZone: ZONE,
    localTime: null, reportedDaylightType: null, resolvedDaylightType: null, timezoneDiagnostic: null,
    calendarDate: null, sessionStartDate: null, sessionEndDate: null, issue: null,
  };
  const unknown = (issue: string): SessionResolution => ({ ...result, session: 'UNKNOWN', issue });
  if (!Number.isFinite(nowUtc) || nowUtc < 0 || nowUtc > 8640000000000000) return unknown('Invalid injected UTC timestamp.');
  try {
    result.evaluatedAt = new Date(nowUtc).toISOString();
    const local = wallTime(nowUtc);
    result.localTime = new Date(local).toISOString().slice(0, 19);
    result.calendarDate = result.localTime.slice(0, 10);
    const year = new Date(local).getUTCFullYear();
    const offsetAt = (utc: number) => wallTime(utc) - Math.floor(utc / 1000) * 1000;
    // Discover standard offset from IANA seasonal rules, never a hardcoded UTC offset.
    const standardOffset = Math.min(offsetAt(Date.UTC(year, 0, 15, 12)), offsetAt(Date.UTC(year, 6, 15, 12)));
    const daylight = offsetAt(nowUtc) > standardOffset ? 'dst' : 'standard';
    result.resolvedDaylightType = daylight;

    const rawStates = payload(statesBody);
    const markets = Array.isArray(rawStates) ? rawStates : [rawStates];
    const us = markets.filter(value => isRecord(value) && value.market === 'US');
    if (us.length !== 1 || !isRecord(us[0])) return unknown('Missing or ambiguous Bitget US schedule.');
    const states = us[0];
    result.reportedDaylightType = typeof states.daylightType === 'string' ? states.daylightType : null;
    const timezoneWarnings: string[] = [];
    if (!['standard', 'dst'].includes(String(states.daylightType))) {
      timezoneWarnings.push(`Bitget daylightType is ${result.reportedDaylightType ?? 'missing'}; using ${ZONE} (${daylight}).`);
    } else if (states.daylightType !== daylight) {
      timezoneWarnings.push(`Bitget daylightType reports ${states.daylightType} while ${ZONE} resolves to ${daylight}; IANA timezone rules are authoritative.`);
    }
    result.timezoneDiagnostic = timezoneWarnings.join(' ') || null;
    if (!Array.isArray(states.stateList) || states.stateList.length !== 4) return unknown('Bitget schedule must contain four verified session entries.');
    const schedule: { session: MarketSession; start: number; end: number; zone: string }[] = [];
    for (const state of states.stateList) {
      if (!isRecord(state)) return unknown('Malformed Bitget schedule entry.');
      const session = normalizeSession(state.state);
      const start = minutes(state.startTime), end = minutes(state.endTime);
      if (session === 'UNKNOWN' || session === 'CLOSED' || start === null || end === null || start === end) return unknown('Unknown state or invalid schedule times.');
      if (!['ET', 'EST', 'EDT', ZONE].includes(String(state.timeZone))) return unknown('Unsupported Bitget schedule timezone.');
      if (schedule.some(entry => entry.session === session)) return unknown('Duplicate Bitget session.');
      schedule.push({ session, start, end, zone: String(state.timeZone) });
    }
    const contains = (minute: number, start: number, end: number) => start < end ? minute >= start && minute < end : minute >= start || minute < end;
    for (let minute = 0; minute < 1440; minute++) {
      if (schedule.filter(s => contains(minute, s.start, s.end)).length !== 1) return unknown('Bitget schedule contains overlapping sessions or gaps.');
    }

    const calendar = payload(calendarBody);
    if (!isRecord(calendar) || !Array.isArray(calendar.regularConfig) || !Array.isArray(calendar.specificConfig)) return unknown('Missing or malformed Bitget calendar.');
    if (!['ET', 'EST', 'EDT', ZONE].includes(String(calendar.timeZone))) return unknown('Unsupported Bitget calendar timezone.');
    const conflictingLabels = [...new Set(schedule.map(s => s.zone).filter(zone => (zone === 'EST' && daylight === 'dst') || (zone === 'EDT' && daylight === 'standard')))];
    if (conflictingLabels.length) timezoneWarnings.push(`Bitget schedule labels ${conflictingLabels.join(', ')} are interpreted using ${ZONE}, not fixed UTC offsets.`);
    if (calendar.timeZone === 'EDT' && daylight === 'standard') timezoneWarnings.push(`Bitget calendar label EDT differs from IANA standard time; using ${ZONE}.`);
    result.timezoneDiagnostic = timezoneWarnings.join(' ') || null;
    const closedDays = calendar.regularConfig;
    if (!closedDays.every(day => typeof day === 'string' && DAYS.includes(day))) return unknown('Unknown calendar weekday closure.');
    const ranges: { start: number; end: number }[] = [];
    for (const range of calendar.specificConfig) {
      if (!isRecord(range)) return unknown('Malformed calendar closure.');
      const start = closureTime(range.startTime), end = closureTime(range.endTime);
      if (start === null || end === null || end <= start) return unknown('Invalid calendar closure range.');
      ranges.push({ start, end });
    }
    const minute = new Date(local).getUTCHours() * 60 + new Date(local).getUTCMinutes();
    const active = schedule.find(s => contains(minute, s.start, s.end))!;
    const crossesMidnight = active.start > active.end;
    const startDay = local - (crossesMidnight && minute < active.end ? 86400000 : 0);
    const endDay = local + (crossesMidnight && minute >= active.start ? 86400000 : 0);
    result.sessionStartDate = new Date(startDay).toISOString().slice(0, 10);
    result.sessionEndDate = new Date(endDay).toISOString().slice(0, 10);
    const isClosed = (wall: number) => closedDays.includes(DAYS[new Date(wall).getUTCDay()]) || ranges.some(r => wall >= r.start && wall < r.end);
    const regionalClosed = isClosed(local);
    // Bitget documents calendar timezone as always EST. In DST, compare both
    // regional Eastern and literal standard-time readings near closure boundaries.
    const standardWall = Math.floor(nowUtc / 1000) * 1000 + standardOffset;
    const literalClosed = calendar.timeZone === 'EST' ? isClosed(standardWall) : regionalClosed;
    if (regionalClosed && literalClosed) return { ...result, session: 'CLOSED', issue: 'Bitget calendar closure.' };
    if (regionalClosed !== literalClosed) return unknown('Bitget EST calendar closure boundary is ambiguous during daylight time.');

    // Weekday-only calendar closures do not define the reopening edge of a
    // midnight-spanning session. Require both adjoining dates to be eligible.
    if (active.start > active.end) {
      const otherDay = local + (minute >= active.start ? 1 : -1) * 86400000;
      if (closedDays.includes(DAYS[new Date(otherDay).getUTCDay()])) return { ...result, session: 'CLOSED', issue: 'Overnight session touches a Bitget weekend closure; conservative closure policy.' };
    }
    return { ...result, session: active.session, issue: null };
  } catch {
    return unknown('Unable to resolve Bitget calendar/timezone safely.');
  }
}
