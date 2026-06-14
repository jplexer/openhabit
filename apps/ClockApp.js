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
    // cached once so compute() doesn't hit Preference every tick
    this.hasNetworks = !!(ctx.net && ctx.net.savedNetworks().length);
    this.compute(ctx);
    this.lastKey = this.key();
  }

  key() {
    return this.timeText + this.dateText + this.statusText;
  }

  compute(ctx) {
    const net = ctx.net;
    const t = ctx.rtc.time; // true-UTC ms, or undefined if the clock is unset
    if (undefined === t) {
      this.timeText = "--:--";
      this.dateText = this.hasNetworks ? "set the clock" : "press dial to set up";
      this.minute = -1;
    } else {
      // RTC holds UTC; shift by the zone's DST-aware offset for local display
      const offset = (net ? net.offsetMinutes(t) : 0) * 60000;
      const d = new Date(t + offset);
      this.minute = d.getUTCMinutes();
      this.timeText = `${pad(d.getUTCHours())}:${pad(this.minute)}`;
      this.dateText = `${DAYS[d.getUTCDay()]}  ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
    // durable indicator only — ignore transient connecting/scanning so the home
    // screen doesn't repaint (a ~0.5s partial) on every intermediate transition
    this.statusText =
      net && "online" === net.status ? (net.synced ? "" : "wifi") : "offline";
  }

  onTick(now, ctx) {
    this.compute(ctx);
    const key = this.key();
    if (key === this.lastKey) return false; // nothing visible changed
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
    // subtle network indicator, top-left (empty when online + synced)
    if (this.statusText)
      poco.drawText(this.statusText, small, black, 8, 6);
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
