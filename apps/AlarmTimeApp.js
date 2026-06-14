/*
 * AlarmTimeApp — set an alarm's HH:MM. Edits the working alarm in place. rotate changes
 * the selected field, dial switches hour/minute, orange/big returns.
 */

import App from "core/App";
import { font } from "core/assets";

const FONT = "OpenSans-Regular-18";
const BIG_FONT = "OpenSans-Semibold-120";
const pad = (n) => (n < 10 ? "0" : "") + n;

class AlarmTimeApp extends App {
  constructor(alarm) {
    super();
    this.alarm = alarm;
    this.field = 0; // 0 = hour, 1 = minute
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      if (0 === this.field) this.alarm.hour = (this.alarm.hour + event.delta + 24) % 24;
      else this.alarm.minute = (this.alarm.minute + event.delta + 60) % 60;
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      this.field = this.field ? 0 : 1;
      return true;
    }
    if ("press" === event.type && ("orange" === event.button || "big" === event.button)) {
      ctx.nav.pop();
      return false;
    }
    return false;
  }

  draw(poco) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT),
      big = font(BIG_FONT);
    const W = poco.width,
      H = poco.height;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("alarm time", f, white, 16, (34 - f.height) >> 1);

    const hh = pad(this.alarm.hour),
      mm = pad(this.alarm.minute);
    const colonW = poco.getTextWidth(":", big),
      hhW = poco.getTextWidth(hh, big),
      mmW = poco.getTextWidth(mm, big);
    const total = hhW + colonW + mmW;
    let x = (W - total) >> 1;
    const y = (H - big.height) >> 1;
    // hour (highlight if selected)
    if (0 === this.field) {
      poco.fillRectangle(black, x - 2, y, hhW + 4, big.height);
      poco.drawText(hh, big, white, x, y);
    } else poco.drawText(hh, big, black, x, y);
    x += hhW;
    poco.drawText(":", big, black, x, y);
    x += colonW;
    if (1 === this.field) {
      poco.fillRectangle(black, x - 2, y, mmW + 4, big.height);
      poco.drawText(mm, big, white, x, y);
    } else poco.drawText(mm, big, black, x, y);

    poco.drawText("rotate: change   dial: field   orange: done", f, black, 16, H - f.height - 10);
  }
}

export default AlarmTimeApp;
