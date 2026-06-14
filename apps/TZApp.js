/*
 * TZApp — timezone picker, step 1: choose a region. Selecting a region opens
 * ZonePickApp with that region's cities. The zone list comes from the IANA database
 * (core/zones); the chosen zone's DST-aware offset is computed by core/tz.
 *
 * rotate scrolls, dial opens the region, orange goes back.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";
import { REGIONS } from "core/zones";
import ZonePickApp from "apps/ZonePickApp";

const FONT = "OpenSans-Regular-18";

class TZApp extends App {
  onMount() {
    if (undefined === this.sel) {
      this.sel = 0;
      this.first = 0;
    }
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(REGIONS.length - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      ctx.nav.push(new ZonePickApp(this.sel));
      return false;
    }
    if ("press" === event.type && "orange" === event.button) {
      ctx.nav.pop();
      return false;
    }
    return false;
  }

  draw(poco, ctx) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT);
    const W = poco.width,
      H = poco.height;
    const here = ctx.net && ctx.net.zoneName;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("time zone", f, white, 16, (34 - f.height) >> 1);

    this.first = drawList(poco, {
      font: f,
      black,
      white,
      x: 8,
      width: W - 16,
      top: 40,
      bottom: H - f.height - 16,
      rowHeight: f.height + 8,
      count: REGIONS.length,
      sel: this.sel,
      first: this.first,
      drawRow: (i, x, ty, selected, rowW) => {
        const r = REGIONS[i];
        const mark = here && here.indexOf(r.name + "/") === 0 ? "• " : "";
        const right = String(r.zones.length);
        const col = selected ? white : black;
        poco.drawText(mark + r.name, f, col, x + 12, ty);
        poco.drawText(right, f, col, x + rowW - 8 - poco.getTextWidth(right, f), ty);
      },
    });
    poco.drawText("dial: open   orange: back", f, black, 16, H - f.height - 10);
  }
}

export default TZApp;
