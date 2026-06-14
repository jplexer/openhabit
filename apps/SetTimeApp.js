/*
 * SetTimeApp — set the clock by hand. Edits local wall-clock fields
 * (year / month / day / hour / minute):
 *   rotate = change the current field, dial = next field,
 *   big = save, orange = cancel.
 * On save the local time is converted to UTC (minus the timezone offset) and written
 * to the RTC, matching the UTC-in-RTC model the rest of the firmware uses.
 */

import App from "core/App";
import { font } from "core/assets";

const FONT = "OpenSans-Regular-18";
const FIELDS = ["year", "month", "day", "hour", "minute"];
const pad = (n) => (n < 10 ? "0" : "") + n;
const wrap = (i, n) => ((i % n) + n) % n;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

class SetTimeApp extends App {
  onMount(ctx) {
    this.field = 0;
    const t = ctx.rtc.time;
    const net = ctx.net;
    // seed from current local time, or a sane default if the clock is unset
    const base = undefined === t ? Date.UTC(2026, 0, 1, 0, 0) : t;
    const off = (net ? net.offsetMinutes(base) : 0) * 60000;
    const d = new Date(base + off);
    this.y = d.getUTCFullYear();
    this.mo = d.getUTCMonth(); // 0-11
    this.d = d.getUTCDate();
    this.h = d.getUTCHours();
    this.mi = d.getUTCMinutes();
  }

  daysInMonth() {
    return new Date(Date.UTC(this.y, this.mo + 1, 0)).getUTCDate();
  }

  adjust(delta) {
    switch (this.field) {
      case 0: this.y = clamp(this.y + delta, 2000, 2099); break;
      case 1: this.mo = wrap(this.mo + delta, 12); break;
      case 2: this.d = wrap(this.d - 1 + delta, this.daysInMonth()) + 1; break;
      case 3: this.h = wrap(this.h + delta, 24); break;
      case 4: this.mi = wrap(this.mi + delta, 60); break;
    }
    const dim = this.daysInMonth(); // keep day valid after a year/month change
    if (this.d > dim) this.d = dim;
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.adjust(event.delta);
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      this.field = (this.field + 1) % FIELDS.length;
      return true;
    }
    if ("press" === event.type && "big" === event.button) {
      // entered values are local; convert to UTC using the offset at that instant
      let utc = Date.UTC(this.y, this.mo, this.d, this.h, this.mi, 0);
      if (ctx.net) utc -= ctx.net.offsetMinutes(utc) * 60000;
      if (ctx.net) ctx.net.setClock(utc);
      else ctx.rtc.time = utc;
      ctx.nav.pop();
      return false;
    }
    if ("press" === event.type && "orange" === event.button) {
      ctx.nav.pop();
      return false;
    }
    return false;
  }

  draw(poco) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT);
    const W = poco.width,
      H = poco.height;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("set time", f, white, 16, (34 - f.height) >> 1);

    // YYYY-MM-DD  HH:MM with the active field highlighted
    const seg = [
      { t: String(this.y), fi: 0 },
      { t: "-" },
      { t: pad(this.mo + 1), fi: 1 },
      { t: "-" },
      { t: pad(this.d), fi: 2 },
      { t: "  " },
      { t: pad(this.h), fi: 3 },
      { t: ":" },
      { t: pad(this.mi), fi: 4 },
    ];
    let x = 16;
    const y = 90;
    for (const s of seg) {
      const w = poco.getTextWidth(s.t, f);
      if (undefined !== s.fi && s.fi === this.field) {
        poco.fillRectangle(black, x - 2, y - 3, w + 4, f.height + 6);
        poco.drawText(s.t, f, white, x, y);
      } else {
        poco.drawText(s.t, f, black, x, y);
      }
      x += w;
    }

    poco.drawText(`editing: ${FIELDS[this.field]}`, f, black, 16, 140);
    poco.drawText("rotate: change   dial: next field", f, black, 16, H - 2 * f.height - 16);
    poco.drawText("big: save   orange: cancel", f, black, 16, H - f.height - 10);
  }
}

export default SetTimeApp;
