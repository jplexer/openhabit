import Poco from "commodetto/Poco";
import parseBMF from "commodetto/parseBMF";
import Resource from "Resource";
import Timer from "timer";

const render = new Poco(screen, { displayListLength: 4096 });
const black = render.makeColor(0, 0, 0);
const white = render.makeColor(255, 255, 255);
const font = parseBMF(new Resource("OpenSans-Regular-18.bf4"));
const W = render.width,
  H = render.height;

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

const rtc = new device.peripheral.RTC({});

function drawClock(timeText, dateText) {
  render.begin();
  render.fillRectangle(white, 0, 0, W, H);
  render.fillRectangle(black, 0, 0, W, 34); // title bar
  render.drawText("openhabit", font, white, 16, (34 - font.height) >> 1);
  render.drawText(
    timeText,
    font,
    black, // time, centered
    (W - render.getTextWidth(timeText, font)) >> 1,
    (H >> 1) - font.height,
  );
  render.drawText(
    dateText,
    font,
    black, // date, centered
    (W - render.getTextWidth(dateText, font)) >> 1,
    (H >> 1) + 6,
  );
  render.end();
}

let lastKey;
function tick() {
  const t = rtc.time;
  let timeText = "--:--",
    dateText = "set the clock";
  let minute = -1;
  if (undefined !== t) {
    const d = new Date(t);
    const hh = d.getUTCHours(),
      mm = d.getUTCMinutes();
    minute = mm;
    timeText = `${pad(hh)}:${pad(mm)}`;
    dateText = `${DAYS[d.getUTCDay()]}  ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  const key = timeText + dateText;
  if (key === lastKey) return;
  lastKey = key;

  if (0 === minute) screen.configure({ refresh: true });

  drawClock(timeText, dateText);
}

trace("openhabit clock: starting\n");
tick();
Timer.repeat(tick, 5000);
