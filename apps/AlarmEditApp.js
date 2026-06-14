/*
 * AlarmEditApp — edit one alarm (or a new one with index < 0). Works on a copy so
 * orange cancels cleanly; Save commits to the Alarms service. Time/Repeat/Sound open
 * sub-screens that mutate the working copy; Sunrise/Enabled toggle inline.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";
import { defaultAlarm, repeatSummary } from "core/Alarms";
import AlarmTimeApp from "apps/AlarmTimeApp";
import AlarmDaysApp from "apps/AlarmDaysApp";
import SoundPickApp from "apps/SoundPickApp";

const FONT = "OpenSans-Regular-18";
const pad = (n) => (n < 10 ? "0" : "") + n;

function basename(p) {
  if (!p) return "none";
  const s = p.lastIndexOf("/");
  let n = s >= 0 ? p.slice(s + 1) : p;
  const d = n.lastIndexOf("."); // drop the file extension
  return d > 0 ? n.slice(0, d) : n;
}

class AlarmEditApp extends App {
  constructor(index) {
    super();
    this.index = index;
  }

  onMount(ctx) {
    if (undefined === this.alarm) {
      this.isNew = this.index < 0;
      const src = this.isNew ? defaultAlarm() : ctx.alarms.alarms[this.index];
      this.alarm = JSON.parse(JSON.stringify(src)); // working copy (cancel-safe)
      this.sel = 0;
      this.first = 0;
    }
  }

  rows() {
    return this.isNew
      ? ["time", "days", "sunrise", "sound", "enabled", "save"]
      : ["time", "days", "sunrise", "sound", "enabled", "save", "delete"];
  }

  label(r) {
    const a = this.alarm;
    switch (r) {
      case "time": return `Time: ${pad(a.hour)}:${pad(a.minute)}`;
      case "days": return `Repeat: ${repeatSummary(a)}`;
      case "sunrise": return `Sunrise: ${a.sunrise ? "on" : "off"}`;
      case "sound": return `Sound: ${basename(a.sound)}`;
      case "enabled": return `Enabled: ${a.enabled ? "yes" : "no"}`;
      case "save": return "Save";
      case "delete": return "Delete";
    }
    return r;
  }

  onEvent(event, ctx) {
    const rows = this.rows();
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(rows.length - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) return this.activate(ctx, rows[this.sel]);
    if ("press" === event.type && "orange" === event.button) {
      ctx.nav.pop(); // cancel
      return false;
    }
    return false;
  }

  activate(ctx, r) {
    switch (r) {
      case "time":
        ctx.nav.push(new AlarmTimeApp(this.alarm));
        return false;
      case "days":
        ctx.nav.push(new AlarmDaysApp(this.alarm));
        return false;
      case "sunrise":
        this.alarm.sunrise = !this.alarm.sunrise;
        return true;
      case "sound":
        ctx.nav.push(new SoundPickApp((p) => (this.alarm.sound = p)));
        return false;
      case "enabled":
        this.alarm.enabled = !this.alarm.enabled;
        return true;
      case "save":
        if (this.isNew) ctx.alarms.alarms.push(this.alarm);
        else ctx.alarms.alarms[this.index] = this.alarm;
        ctx.alarms.save();
        ctx.nav.pop();
        return false;
      case "delete":
        ctx.alarms.alarms.splice(this.index, 1);
        ctx.alarms.save();
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
    const rows = this.rows();
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText(this.isNew ? "new alarm" : "edit alarm", f, white, 16, (34 - f.height) >> 1);

    this.first = drawList(poco, {
      font: f,
      black,
      white,
      x: 8,
      width: W - 16,
      top: 40,
      bottom: H - f.height - 10,
      rowHeight: f.height + 8,
      count: rows.length,
      sel: this.sel,
      first: this.first,
      drawRow: (i, x, ty, selected) =>
        poco.drawText(this.label(rows[i]), f, selected ? white : black, x + 12, ty),
    });
    poco.drawText("dial: change   orange: cancel", f, black, 16, H - f.height - 8);
  }
}

export default AlarmEditApp;
