import App from "core/App";
import MenuApp from "apps/MenuApp";
import registry from "apps/registry";
import { font } from "core/assets";

const TIME_FONT = "OpenSans-Semibold-120"; // custom outline font (see manifest.json)
const DATE_FONT = "OpenSans-Regular-18";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad = (n) => (n < 10 ? "0" : "") + n;

class ClockApp extends App {
  onMount(ctx) {
    this.compute(ctx);
    this.lastKey = this.timeText + this.dateText;
  }

  compute(ctx) {
    const t = ctx.rtc.time; // ms, or undefined if the clock is unset
    if (undefined === t) {
      this.timeText = "--:--";
      this.dateText = "set the clock";
      this.minute = -1;
      return;
    }
    const d = new Date(t);
    this.minute = d.getUTCMinutes();
    this.timeText = `${pad(d.getUTCHours())}:${pad(this.minute)}`;
    this.dateText = `${DAYS[d.getUTCDay()]}  ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  onTick(now, ctx) {
    this.compute(ctx);
    const key = this.timeText + this.dateText;
    if (key === this.lastKey) return false; // minute hasn't changed
    this.lastKey = key;
    return true;
  }

  onEvent(event, ctx) {
    if ("press" === event.type && "dial" === event.button) {
      ctx.nav.push(new MenuApp(registry));
      return false; // MenuApp renders itself on push
    }
    return false;
  }

  draw(poco) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const big = font(TIME_FONT),
      small = font(DATE_FONT);
    const W = poco.width,
      H = poco.height;
    poco.fillRectangle(white, 0, 0, W, H);
    // large time, centered in the space above the date
    poco.drawText(
      this.timeText,
      big,
      black,
      (W - poco.getTextWidth(this.timeText, big)) >> 1,
      ((H - small.height) - big.height) >> 1,
    );
    // date along the bottom
    poco.drawText(
      this.dateText,
      small,
      black,
      (W - poco.getTextWidth(this.dateText, small)) >> 1,
      H - small.height - 10,
    );
  }
}

export default ClockApp;
