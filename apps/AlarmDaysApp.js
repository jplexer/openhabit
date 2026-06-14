/*
 * AlarmDaysApp — toggle the days an alarm repeats on. Displayed Monday-first; the data
 * stays indexed by day number (0=Sun..6=Sat, matching Date.getUTCDay). rotate moves,
 * dial toggles, orange returns. Edits the working alarm in place.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";

const FONT = "OpenSans-Regular-18";
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display → day-number index
const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

class AlarmDaysApp extends App {
  constructor(alarm) {
    super();
    this.alarm = alarm;
    this.sel = 0;
    this.first = 0;
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(ORDER.length - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      const d = ORDER[this.sel];
      this.alarm.days[d] = !this.alarm.days[d];
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
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("repeat", f, white, 16, (34 - f.height) >> 1);

    this.first = drawList(poco, {
      font: f,
      black,
      white,
      x: 8,
      width: W - 16,
      top: 40,
      bottom: H - f.height - 10,
      rowHeight: f.height + 8,
      count: ORDER.length,
      sel: this.sel,
      first: this.first,
      drawRow: (i, x, ty, selected) => {
        const d = ORDER[i];
        const mark = this.alarm.days[d] ? "[x] " : "[ ] ";
        poco.drawText(mark + NAMES[d], f, selected ? white : black, x + 12, ty);
      },
    });
    poco.drawText("dial: toggle   orange: back", f, black, 16, H - f.height - 8);
  }
}

export default AlarmDaysApp;
