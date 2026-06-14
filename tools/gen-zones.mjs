#!/usr/bin/env node
/*
 * gen-zones.mjs — regenerate core/zones.js from the official IANA tz database.
 *
 * Usage:   node tools/gen-zones.mjs
 *
 * What it does:
 *   1. Downloads the latest IANA release (https://ftp.iana.org/tz/tzdata-latest.tar.gz)
 *      and reads its canonical zone list (zone1970.tab) + version.
 *   2. For each zone, synthesises a current-era POSIX TZ string (std/dst offsets +
 *      Mm.w.d transition rules) by probing the ECMAScript Intl/ICU database — which is
 *      itself the IANA data, and reflects present-day rules (the binary TZif "footer"
 *      can encode pending FUTURE law changes, so we don't use it).
 *   3. Validates every generated string against Intl for 2026–2031.
 *   4. Writes core/zones.js, grouped by region, consumed at runtime by core/tz.js.
 *
 * Requires: Node 18+ (global Intl with full tz data), and `curl` + `tar` on PATH.
 *
 * Known limitation: Morocco (Africa/Casablanca, Africa/El_Aaiun) uses Ramadan-based
 * DST that no fixed recurring rule can express; those two may be off by 1h during the
 * Ramadan window in some years. They are reported as mismatches at the end.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(fileURLToPath(import.meta.url), "../../core/zones.js");
const URL = "https://ftp.iana.org/tz/tzdata-latest.tar.gz";
const ORDER = ["America", "Europe", "Asia", "Africa", "Australia", "Pacific", "Atlantic", "Indian", "Antarctica", "Arctic", "Etc"];

// ---- POSIX TZ evaluator (kept in sync with core/tz.js) ----
function parseOffset(s) { const m = /^([+-]?)(\d{1,3})(?::(\d{2}))?(?::(\d{2}))?$/.exec(s); if (!m) return null; return (m[1] === "-" ? -1 : 1) * ((+m[2]) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0))); }
function tokName(str, i) { if (str[i] === "<") return str.indexOf(">", i) + 1; let j = i; while (j < str.length && /[A-Za-z]/.test(str[j])) j++; return j; }
function parseTZ(tz) { let i = tokName(tz, 0), j = i; while (j < tz.length && /[-+0-9:]/.test(tz[j])) j++; const stdOff = parseOffset(tz.slice(i, j)); i = j; if (i >= tz.length) return { stdOff, dst: false }; i = tokName(tz, i); j = i; while (j < tz.length && /[-+0-9:]/.test(tz[j])) j++; let dstOff; if (j > i) { dstOff = parseOffset(tz.slice(i, j)); i = j; } else dstOff = stdOff - 3600; const p = tz.slice(i).split(","); return { stdOff, dst: true, dstOff, startRule: p[1], endRule: p[2] }; }
function ruleToUTC(rule, year, offSec) { let timeSec = 7200, spec = rule; const sl = rule.indexOf("/"); if (sl >= 0) { spec = rule.slice(0, sl); timeSec = parseOffset(rule.slice(sl + 1)); } const m = /^M(\d+)\.(\d+)\.(\d+)$/.exec(spec); if (!m) return null; const mon = +m[1], week = +m[2], dow = +m[3]; const first = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay(); let day = 1 + ((dow - first + 7) % 7) + (week - 1) * 7; const dim = new Date(Date.UTC(year, mon, 0)).getUTCDate(); if (day > dim) day -= 7; return (Date.UTC(year, mon - 1, day, 0, 0, 0) + timeSec * 1000 + offSec * 1000) / 1000; }
function evalOff(tz, utcMs) { const p = parseTZ(tz); if (!p.dst) return -p.stdOff / 60; const year = new Date(utcMs).getUTCFullYear(); const t = utcMs / 1000; const s = ruleToUTC(p.startRule, year, p.stdOff), e = ruleToUTC(p.endRule, year, p.dstOff); const inDst = s < e ? t >= s && t < e : t >= s || t < e; return -(inDst ? p.dstOff : p.stdOff) / 60; }

// ---- Intl oracle (cached formatters) ----
const fmtCache = new Map(), abCache = new Map();
function fmt(z) { let f = fmtCache.get(z); if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); fmtCache.set(z, f); } return f; }
function off(z, ms) { const p = {}; for (const x of fmt(z).formatToParts(new Date(ms))) p[x.type] = x.value; let H = +p.hour; if (H === 24) H = 0; return Math.round((Date.UTC(+p.year, p.month - 1, +p.day, H, +p.minute, +p.second) - ms) / 60000); }
function abbr(z, ms) { let f = abCache.get(z); if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "short" }); abCache.set(z, f); } try { const pp = f.formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName"); return pp ? pp.value : ""; } catch (e) { return ""; } }

function posOff(m) { let v = -m; const s = v < 0 ? "-" : ""; v = Math.abs(v); const hh = Math.floor(v / 60), mm = v % 60; return s + hh + (mm ? ":" + (mm < 10 ? "0" : "") + mm : ""); }
function nameTok(z, ms, m) { const a = abbr(z, ms); if (/^[A-Za-z]{3,}$/.test(a)) return a; const e = m >= 0 ? "+" : "-"; let v = Math.abs(m); const hh = Math.floor(v / 60), mm = v % 60; return "<" + e + (hh < 10 ? "0" : "") + hh + (mm ? (mm < 10 ? "0" : "") + mm : "") + ">"; }
function rule(inst, offMin) { const d = new Date(inst + offMin * 60000); const mon = d.getUTCMonth() + 1, dom = d.getUTCDate(), dow = d.getUTCDay(), hh = d.getUTCHours(), mm = d.getUTCMinutes(), ss = d.getUTCSeconds(); const dim = new Date(Date.UTC(d.getUTCFullYear(), mon, 0)).getUTCDate(); let week = Math.ceil(dom / 7); if (dom + 7 > dim) week = 5; let t = hh + ":" + (mm < 10 ? "0" : "") + mm; if (ss) t += ":" + (ss < 10 ? "0" : "") + ss; if (t === "2:00") t = ""; return `M${mon}.${week}.${dow}` + (t ? "/" + t : ""); }
function synth(zone, year) {
  const jan = Date.UTC(year, 0, 1);
  let prev = off(zone, jan), trans = [];
  for (let d = 1; d <= 365; d++) {
    const ms = jan + d * 86400000, o = off(zone, ms);
    if (o !== prev) {
      let lo = ms - 86400000, hi = ms;
      while (hi - lo > 60000) { const mid = Math.floor((lo + hi) / 2); (off(zone, mid) === prev) ? (lo = mid) : (hi = mid); }
      trans.push({ inst: hi, to: o }); prev = o;
    }
  }
  const offs = new Set([off(zone, jan)]); trans.forEach((t) => offs.add(t.to));
  if (trans.length === 0) { const o = off(zone, jan); return { posix: nameTok(zone, jan, o) + posOff(o) }; }
  if (trans.length === 2 && offs.size === 2) {
    const std = Math.min(...offs), dst = Math.max(...offs);
    const start = trans.find((t) => t.to === dst), end = trans.find((t) => t.to === std);
    return { posix: `${nameTok(zone, start.inst - 1, std)}${posOff(std)}${nameTok(zone, start.inst + 1, dst)}${posOff(dst)},${rule(start.inst, std)},${rule(end.inst, dst)}` };
  }
  const o = off(zone, jan); return { posix: nameTok(zone, jan, o) + posOff(o), irregular: true };
}

// ---- fetch IANA data ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tzgen-"));
console.log(`downloading ${URL} …`);
execSync(`curl -sSL --max-time 120 -o "${tmp}/tz.tgz" ${URL}`, { stdio: "inherit" });
execSync(`tar xzf "${tmp}/tz.tgz" -C "${tmp}" version zone1970.tab`, { stdio: "inherit" });
const ver = fs.readFileSync(path.join(tmp, "version"), "utf8").trim();
const zones = fs.readFileSync(path.join(tmp, "zone1970.tab"), "latin1").split("\n")
  .filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[2]).filter(Boolean);
console.log(`IANA ${ver}: ${zones.length} canonical zones`);

// ---- synthesise + validate ----
const gen = {}; let checks = 0, fails = 0; const bad = [], skipped = [];
for (const name of zones) {
  let s; try { off(name, Date.now()); s = synth(name, 2027); } catch (e) { skipped.push(name); continue; }
  gen[name] = s.posix;
  for (let y = 2026; y <= 2031; y++) for (let mo = 0; mo < 12; mo++) { const ms = Date.UTC(y, mo, 15, 12, 0); checks++; if (evalOff(s.posix, ms) !== off(name, ms)) { fails++; if (bad.length < 20) bad.push(`${name} [${s.posix}] ${y}-${mo + 1}`); } }
}
console.log(`validated ${checks - fails}/${checks} checks; ${skipped.length} skipped; ${fails} mismatches`);
if (bad.length) { console.log("mismatches (expected: Morocco/Ramadan):"); bad.forEach((b) => console.log("  " + b)); }

// ---- group by region + emit ----
const byRegion = {};
for (const name of zones) {
  if (!gen[name]) continue;
  const slash = name.indexOf("/"); if (slash < 0) continue;
  const region = name.slice(0, slash);
  const city = name.slice(slash + 1).replace(/_/g, " ").replace(/\//g, " / ");
  (byRegion[region] ??= []).push([city, name, gen[name]]);
}
const regions = Object.keys(byRegion).sort((a, b) => ((ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b))) || a.localeCompare(b));
for (const r of regions) byRegion[r].sort((a, b) => a[0].localeCompare(b[0]));

let out = `/*
 * zones.js — GENERATED, do not edit by hand. Regenerate with: node tools/gen-zones.mjs
 *
 * Source: IANA tz database ${ver} (zone1970.tab for the canonical zone list);
 * per-zone POSIX TZ rules synthesised from the same database via ECMAScript Intl and
 * validated against it for 2026–2031. Evaluated at runtime by core/tz.js.
 *
 * Note: Africa/Casablanca and Africa/El_Aaiun (Morocco) use Ramadan-based DST that no
 * fixed recurring rule can express exactly; their offset may be off by 1h during the
 * Ramadan window in some years.
 *
 * Each zone is [city, ianaName, posixTZ]. Grouped by region for the picker.
 */

export const TZ_VERSION = ${JSON.stringify(ver)};

export const REGIONS = [
`;
for (const r of regions) {
  out += `  { name: ${JSON.stringify(r)}, zones: [\n`;
  for (const z of byRegion[r]) out += `    [${JSON.stringify(z[0])}, ${JSON.stringify(z[1])}, ${JSON.stringify(z[2])}],\n`;
  out += `  ] },\n`;
}
out += `];

// lazy IANA-name → POSIX-TZ lookup (built once on first use; kept off the frozen
// preloaded module per the same pattern as core/assets)
export function posixFor(name) {
  let m = globalThis.__tzmap;
  if (!m) {
    m = globalThis.__tzmap = {};
    for (const r of REGIONS) for (const z of r.zones) m[z[1]] = z[2];
  }
  return m[name];
}
`;
fs.writeFileSync(OUT, out);
fs.rmSync(tmp, { recursive: true, force: true });
const total = regions.reduce((a, r) => a + byRegion[r].length, 0);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${regions.length} regions, ${total} zones, ${(out.length / 1024).toFixed(1)}KB`);
