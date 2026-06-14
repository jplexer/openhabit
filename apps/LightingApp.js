/*
 * LightingApp — pick the backlight brightness (5/25/50/75/100 %). The light previews
 * live as you rotate; dial/big saves, orange cancels (and restores the prior level).
 * The light is held on while this screen is open so you can see the preview.
 */

import App from "core/App";
import { font } from "core/assets";

const FONT = "OpenSans-Regular-18";
const LEVELS = [5, 25, 50, 75, 100];

class LightingApp extends App {
  onMount(ctx) {
    this.bl = ctx.backlight;
    this.origPct = this.bl ? this.bl.pct : 100;
    const i = LEVELS.indexOf(this.origPct);
    this.sel = i >= 0 ? i : LEVELS.length - 1;
    if (this.bl) {
      this.bl.setHold(true); // keep the light on for the preview
      this.bl.setBrightness(LEVELS[this.sel], false); // show current level
    }
  }

  onUnmount() {
    if (this.bl) this.bl.setHold(false);
  }

  preview() {
    if (this.bl) this.bl.setBrightness(LEVELS[this.sel], false); // live, not saved
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(LEVELS.length - 1, this.sel + event.delta));
      this.preview();
      return true;
    }
    if ("press" === event.type && ("dial" === event.button || "big" === event.button)) {
      if (this.bl) this.bl.setBrightness(LEVELS[this.sel], true); // save
      ctx.nav.pop();
      return false;
    }
    if ("press" === event.type && "orange" === event.button) {
      if (this.bl) this.bl.setBrightness(this.origPct, false); // restore preview
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
    const pct = LEVELS[this.sel];
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("lighting", f, white, 16, (34 - f.height) >> 1);

    const label = pct + "%";
    poco.drawText(label, f, black, (W - poco.getTextWidth(label, f)) >> 1, 60);

    // brightness bar: outline + proportional fill (on-screen preview)
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

export default LightingApp;
