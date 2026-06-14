/*
 * ZonePickApp — timezone picker, step 2: choose a city within a region. Selecting one
 * saves it (ctx.net.setZone) and returns to the Date & Time screen. Opened by TZApp.
 *
 * rotate scrolls, dial selects (and pops back to Date & Time), orange returns to regions.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";
import { REGIONS } from "core/zones";

const FONT = "OpenSans-Regular-18";

class ZonePickApp extends App {
  constructor(regionIndex) {
    super();
    this.ri = regionIndex;
    this.sel = 0;
    this.first = 0;
  }

  onMount(ctx) {
    // start on the currently-selected zone if it's in this region
    const cur = ctx.net && ctx.net.zoneName;
    if (cur) {
      const i = REGIONS[this.ri].zones.findIndex((z) => z[1] === cur);
      if (i >= 0) this.sel = i;
    }
  }

  onEvent(event, ctx) {
    const zones = REGIONS[this.ri].zones;
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(zones.length - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      ctx.net && ctx.net.setZone(zones[this.sel][1]);
      ctx.nav.pop(); // leave the city list (back to regions)
      ctx.nav.pop(); // leave the region list (back to Date & Time)
      return false;
    }
    if ("press" === event.type && "orange" === event.button) {
      ctx.nav.pop(); // back to regions
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
    const region = REGIONS[this.ri];
    const cur = ctx.net && ctx.net.zoneName;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText(region.name, f, white, 16, (34 - f.height) >> 1);

    this.first = drawList(poco, {
      font: f,
      black,
      white,
      x: 8,
      width: W - 16,
      top: 40,
      bottom: H - f.height - 16,
      rowHeight: f.height + 8,
      count: region.zones.length,
      sel: this.sel,
      first: this.first,
      drawRow: (i, x, ty, selected) => {
        const z = region.zones[i];
        const mark = z[1] === cur ? "• " : "";
        poco.drawText(mark + z[0], f, selected ? white : black, x + 12, ty);
      },
    });
    poco.drawText("dial: select   orange: back", f, black, 16, H - f.height - 10);
  }
}

export default ZonePickApp;
