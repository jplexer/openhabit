/*
 * VolumeApp — set audio output volume (a digital attenuation applied by the Player,
 * since the amp's gain is fixed in hardware). rotate adjusts, dial/big saves, orange
 * cancels. Stored as a percentage in Preference; the Player reads it on each play.
 */

import App from "core/App";
import { font } from "core/assets";
import Preference from "preference";

const FONT = "OpenSans-Regular-18";
const DOMAIN = "openhabit";
const STEP = 5; // percent per detent
const DEFAULT = 60;

class VolumeApp extends App {
  onMount() {
    const v = Preference.get(DOMAIN, "volume");
    const cur = undefined === v ? DEFAULT : v;
    this.pct = Math.max(0, Math.min(100, Math.round(cur / STEP) * STEP));
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.pct = Math.max(0, Math.min(100, this.pct + event.delta * STEP));
      return true;
    }
    if ("press" === event.type && ("dial" === event.button || "big" === event.button)) {
      Preference.set(DOMAIN, "volume", this.pct);
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
    const pct = this.pct;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("volume", f, white, 16, (34 - f.height) >> 1);

    const label = pct + "%";
    poco.drawText(label, f, black, (W - poco.getTextWidth(label, f)) >> 1, 60);

    const bx = 30,
      by = 100,
      bw = W - 60,
      bh = 34;
    poco.fillRectangle(black, bx, by, bw, 2);
    poco.fillRectangle(black, bx, by + bh - 2, bw, 2);
    poco.fillRectangle(black, bx, by, 2, bh);
    poco.fillRectangle(black, bx + bw - 2, by, 2, bh);
    poco.fillRectangle(black, bx + 4, by + 4, Math.round(((bw - 8) * pct) / 100), bh - 8);

    poco.drawText("rotate: adjust", f, black, 16, H - 2 * f.height - 12);
    poco.drawText("dial: save   orange: cancel", f, black, 16, H - f.height - 8);
  }
}

export default VolumeApp;
