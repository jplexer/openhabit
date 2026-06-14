/*
 * AlarmsApp — the alarm list (home menu). Each row shows the time and a short repeat
 * summary plus sunrise/sound markers. dial edits, long-press dial toggles enabled, the
 * trailing row adds a new alarm. orange goes back.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";
import { repeatSummary } from "core/Alarms";
import AlarmEditApp from "apps/AlarmEditApp";

const FONT = "OpenSans-Regular-18";
const pad = (n) => (n < 10 ? "0" : "") + n;

class AlarmsApp extends App {
  onMount(ctx) {
    this.alarms = ctx.alarms;
    if (undefined === this.sel) {
      this.sel = 0;
      this.first = 0;
    }
    this.lastKey = this.key();
  }

  list() {
    return (this.alarms && this.alarms.alarms) || [];
  }

  key() {
    return JSON.stringify(this.list()) + ":" + this.sel;
  }

  onTick() {
    const k = this.key();
    if (k === this.lastKey) return false;
    this.lastKey = k;
    return true;
  }

  onEvent(event, ctx) {
    const list = this.list();
    const n = list.length + 1; // + "new alarm"
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(n - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      ctx.nav.push(new AlarmEditApp(this.sel >= list.length ? -1 : this.sel));
      return false;
    }
    if ("longpress" === event.type && "dial" === event.button && this.sel < list.length) {
      list[this.sel].enabled = !list[this.sel].enabled;
      this.alarms.save();
      return true;
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
    const list = this.list();
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("alarms", f, white, 16, (34 - f.height) >> 1);

    this.first = drawList(poco, {
      font: f,
      black,
      white,
      x: 8,
      width: W - 16,
      top: 40,
      bottom: H - f.height - 10,
      rowHeight: f.height + 8,
      count: list.length + 1,
      sel: this.sel,
      first: this.first,
      drawRow: (i, x, ty, selected) => {
        const col = selected ? white : black;
        if (i >= list.length) {
          poco.drawText("+ new alarm", f, col, x + 12, ty);
          return;
        }
        const a = list[i];
        const time = `${pad(a.hour)}:${pad(a.minute)}`;
        const marks =
          (a.enabled ? "" : "(off) ") +
          repeatSummary(a) +
          (a.sunrise ? " +sun" : "") +
          (a.sound ? " +snd" : "");
        poco.drawText(time, f, col, x + 12, ty);
        poco.drawText(marks, f, col, x + 88, ty);
      },
    });
    poco.drawText("dial edit · hold: on/off · orange back", f, black, 16, H - f.height - 8);
  }
}

export default AlarmsApp;
