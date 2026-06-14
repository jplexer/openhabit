/*
 * DateTimeApp — the Date & Time settings screen. Shows the current local time and
 * sync state, with three actions: sync from the internet now, set the clock by hand,
 * or change the timezone offset. Reached from Settings.
 *
 * Time is stored as UTC in the RTC; the selected IANA zone's DST-aware offset
 * (ctx.net.offsetMinutes) is applied here only for display.
 */

import App from "core/App";
import { font } from "core/assets";
import SetTimeApp from "apps/SetTimeApp";
import TZApp from "apps/TZApp";

const FONT = "OpenSans-Regular-18";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ITEMS = 3; // Sync now · Set manually · Time zone (labels via itemLabel)
const pad = (n) => (n < 10 ? "0" : "") + n;

function fmtOffset(min) {
  const a = Math.abs(min);
  return `${min < 0 ? "-" : "+"}${pad((a / 60) | 0)}:${pad(a % 60)}`;
}

class DateTimeApp extends App {
  onMount(ctx) {
    this.sel = 0;
    this.compute(ctx);
    this.lastKey = this.key();
  }

  compute(ctx) {
    const net = ctx.net;
    const t = ctx.rtc.time;
    if (undefined === t) {
      this.nowText = "--:--  (clock unset)";
    } else {
      const off = (net ? net.offsetMinutes(t) : 0) * 60000;
      const d = new Date(t + off);
      this.nowText = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}  ${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
    // current zone label + its DST-aware offset right now
    if (net && net.zoneName) {
      const cur = net.offsetMinutes(t === undefined ? Date.now() : t);
      this.tzText = `${net.zoneName} (UTC${fmtOffset(cur)})`;
    } else {
      this.tzText = "not set";
    }
    if (!net) this.syncText = "";
    else if (net.syncing) this.syncText = "syncing…";
    else if ("sntp" === net.lastError) this.syncText = "failed";
    else if ("online" !== net.status) this.syncText = "offline";
    else this.syncText = net.synced ? "synced" : "not synced";
  }

  itemLabel(i) {
    if (0 === i) return this.syncText ? `Sync now (${this.syncText})` : "Sync now";
    if (1 === i) return "Set manually";
    return `Time zone: ${this.tzText}`;
  }

  key() {
    return this.nowText + this.tzText + this.syncText + ":" + this.sel;
  }

  onTick(now, ctx) {
    this.compute(ctx);
    const key = this.key();
    if (key === this.lastKey) return false;
    this.lastKey = key;
    return true;
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(ITEMS - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) return this.activate(ctx);
    if ("press" === event.type && "orange" === event.button) {
      ctx.nav.pop();
      return false;
    }
    return false;
  }

  activate(ctx) {
    if (0 === this.sel) {
      ctx.net && ctx.net.syncTime(); // no-op if offline; syncText reflects it
      return true;
    }
    if (1 === this.sel) ctx.nav.push(new SetTimeApp());
    else ctx.nav.push(new TZApp());
    return false; // pushed app renders itself
  }

  draw(poco) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT);
    const W = poco.width,
      H = poco.height,
      lh = f.height + 10;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("date & time", f, white, 16, (34 - f.height) >> 1);

    // single info line: current local time
    poco.drawText(this.nowText, f, black, 16, 44);

    let y = 44 + lh + 6;
    for (let i = 0; i < ITEMS; i++) {
      if (i === this.sel) {
        poco.fillRectangle(black, 8, y - 3, W - 16, lh);
        poco.drawText(this.itemLabel(i), f, white, 20, y);
      } else {
        poco.drawText(this.itemLabel(i), f, black, 20, y);
      }
      y += lh;
    }
    poco.drawText("orange → back", f, black, 16, H - f.height - 10);
  }
}

export default DateTimeApp;
