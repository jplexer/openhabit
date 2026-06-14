/*
 * LightingApp — pick a light's brightness (5/25/50/75/100 %), with live preview: the
 * light shows each level as you rotate; dial/big saves, orange cancels (restoring the
 * prior level and on/off state). Generic over which light via a ctx key + title, so
 * the front backlight and the big light get separate, identical settings screens.
 *
 *   new LightingApp("backlight", "front light")
 *   new LightingApp("bigLight",  "big light")
 */

import App from "core/App";
import { font } from "core/assets";

const FONT = "OpenSans-Regular-18";
const LEVELS = [5, 25, 50, 75, 100];

class LightingApp extends App {
  constructor(which = "backlight", title = "lighting") {
    super();
    this.which = which;
    this.title = title;
  }

  onMount(ctx) {
    this.l = ctx[this.which];
    this.origPct = this.l ? this.l.pct : 100;
    const i = LEVELS.indexOf(this.origPct);
    this.sel = i >= 0 ? i : LEVELS.length - 1;
    if (this.l) {
      this.l.previewBegin();
      this.l.previewSet(LEVELS[this.sel]);
    }
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(LEVELS.length - 1, this.sel + event.delta));
      if (this.l) this.l.previewSet(LEVELS[this.sel]);
      return true;
    }
    if ("press" === event.type && ("dial" === event.button || "big" === event.button)) {
      if (this.l) this.l.previewSave(LEVELS[this.sel]);
      ctx.nav.pop();
      return false;
    }
    if ("press" === event.type && "orange" === event.button) {
      if (this.l) this.l.previewCancel(this.origPct);
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
    poco.drawText(this.title, f, white, 16, (34 - f.height) >> 1);

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
