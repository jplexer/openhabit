/*
 * tz — evaluate a POSIX TZ string to a UTC offset, including DST.
 *
 * The zone table (apps/zones.js) stores, per IANA zone, a POSIX TZ string such as
 * "PST8PDT,M3.2.0,M11.1.0" or "<+0530>-5:30" (no DST) or "IST-2IDT,M3.4.4/26,M10.5.0".
 * offsetMinutes() returns the minutes to ADD to a UTC instant to get local wall time
 * (e.g. -300 for US Eastern in winter, -240 in summer).
 *
 * Validated against the ECMAScript Intl/ICU database for every IANA zone across
 * 2026–2031 (see tools/gen-zones — the same evaluator generates and checks the table).
 *
 * POSIX sign convention: the numeric offset is time WEST of UTC, so "PST8" means
 * UTC = local + 8h, i.e. 8 hours behind — we negate it to get "minutes east".
 */

function parseOffset(s) {
  const m = /^([+-]?)(\d{1,3})(?::(\d{2}))?(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const sign = "-" === m[1] ? -1 : 1;
  return sign * ((+m[2]) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)));
}

// read a zone name token: either letters, or a quoted <...> form
function tokenName(str, i) {
  if ("<" === str[i]) {
    const j = str.indexOf(">", i);
    return j + 1;
  }
  let j = i;
  while (j < str.length && /[A-Za-z]/.test(str[j])) j++;
  return j;
}

function parseTZ(tz) {
  let i = tokenName(tz, 0);
  let j = i;
  while (j < tz.length && /[-+0-9:]/.test(tz[j])) j++;
  const stdOff = parseOffset(tz.slice(i, j));
  i = j;
  if (i >= tz.length) return { stdOff, dst: false };

  i = tokenName(tz, i);
  j = i;
  while (j < tz.length && /[-+0-9:]/.test(tz[j])) j++;
  let dstOff;
  if (j > i) {
    dstOff = parseOffset(tz.slice(i, j));
    i = j;
  } else {
    dstOff = stdOff - 3600; // POSIX default: 1h ahead of standard
  }
  const parts = tz.slice(i).split(",");
  return { stdOff, dst: true, dstOff, startRule: parts[1], endRule: parts[2] };
}

// UTC seconds of a "Mm.w.d[/time]" transition in the given year. offSec is the local
// UTC offset (POSIX, seconds west) in effect just before the transition.
function ruleToUTC(rule, year, offSec) {
  let timeSec = 7200; // default 02:00:00 local
  let spec = rule;
  const slash = rule.indexOf("/");
  if (slash >= 0) {
    spec = rule.slice(0, slash);
    timeSec = parseOffset(rule.slice(slash + 1));
  }
  const m = /^M(\d+)\.(\d+)\.(\d+)$/.exec(spec);
  if (!m) return null;
  const mon = +m[1],
    week = +m[2],
    dow = +m[3];
  const firstDow = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  let day = 1 + ((dow - firstDow + 7) % 7) + (week - 1) * 7;
  const dim = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  if (day > dim) day -= 7; // week 5 = last occurrence
  return (Date.UTC(year, mon - 1, day, 0, 0, 0) + timeSec * 1000 + offSec * 1000) / 1000;
}

// minutes to add to a UTC instant (ms) to get local wall-clock time
export function offsetMinutes(tz, utcMs) {
  if (!tz) return 0;
  const p = parseTZ(tz);
  if (!p.dst) return -p.stdOff / 60;
  const year = new Date(utcMs).getUTCFullYear();
  const t = utcMs / 1000;
  const start = ruleToUTC(p.startRule, year, p.stdOff);
  const end = ruleToUTC(p.endRule, year, p.dstOff);
  const inDst = start < end ? t >= start && t < end : t >= start || t < end;
  return -(inDst ? p.dstOff : p.stdOff) / 60;
}
