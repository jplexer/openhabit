/*
 * KeyboardApp — on-device text entry on a rotary knob + 3 buttons. Used for Wi-Fi
 * passwords. A flattened character grid with a single linear cursor:
 *
 *   rotate          move the cursor (a fast spin is coalesced by Input into one
 *                   delta → one redraw, so travelling far is cheap on e-ink)
 *   dial            type the highlighted key / activate a special key
 *   orange          backspace            hold orange   cancel
 *   big             submit (OK)
 *
 * Special keys (ABC/abc shift, #+= symbols, space, del, OK) are also in the grid for
 * discoverability. Used as a "modal": call new KeyboardApp({title, secret, onDone});
 * onDone(text) fires on submit, onDone(null) on cancel — then this app pops itself.
 *
 * Each keystroke is a ~0.5s blocking partial refresh, so we de-ghost every few keys to
 * keep the masked field legible (typing never idles long enough for the auto de-ghost).
 */

import App from "core/App";
import { font } from "core/assets";

const FONT = "OpenSans-Regular-18";
const LOWER = "abcdefghijklmnopqrstuvwxyz0123456789";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SYMS = "!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~";
const SPECIALS = ["shift", "sym", "space", "del", "ok"]; // constant count (5)
const COLS = 18; // 36 letters+digits → 2 rows; fits the 240px-tall panel
const DEGHOST_EVERY = 8;

function layerChars(layer) {
  if (1 === layer) return UPPER;
  if (2 === layer) return SYMS;
  return LOWER;
}

function specialLabel(id, layer) {
  switch (id) {
    case "shift": return 1 === layer ? "abc" : "ABC";
    case "sym": return 2 === layer ? "abc" : "#+=";
    case "space": return "space";
    case "del": return "del";
    case "ok": return "OK";
  }
  return id;
}

class KeyboardApp extends App {
  constructor({ title, secret, onDone, initial } = {}) {
    super();
    this.title = title || "enter text";
    this.secret = !!secret;
    this.onDone = onDone;
    this.buffer = initial || "";
    this.layer = 0;
    this.sel = 0;
    this.showLast = false; // briefly reveal the last typed char in secret mode
    this.deghostCount = 0;
  }

  cellCount() {
    return layerChars(this.layer).length + SPECIALS.length;
  }

  maybeDeghost(ctx) {
    if (++this.deghostCount >= DEGHOST_EVERY) {
      this.deghostCount = 0;
      ctx.deghost();
    }
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      const n = this.cellCount();
      this.sel = (((this.sel + event.delta) % n) + n) % n; // wrap
      return true;
    }
    if ("press" === event.type && "dial" === event.button) return this.activate(ctx);
    if ("press" === event.type && "orange" === event.button) {
      this.buffer = this.buffer.slice(0, -1);
      this.showLast = false;
      return true;
    }
    if ("longpress" === event.type && "orange" === event.button) {
      this.finish(ctx, null); // cancel
      return false;
    }
    if ("press" === event.type && "big" === event.button) {
      this.finish(ctx, this.buffer); // submit
      return false;
    }
    return false;
  }

  activate(ctx) {
    const chars = layerChars(this.layer);
    if (this.sel < chars.length) {
      this.buffer += chars[this.sel];
      this.showLast = true;
      this.maybeDeghost(ctx);
      return true;
    }
    const j = this.sel - chars.length;
    switch (SPECIALS[j]) {
      case "shift":
        this.layer = 1 === this.layer ? 0 : 1;
        this.sel = layerChars(this.layer).length + j; // keep cursor on this key
        this.maybeDeghost(ctx);
        break;
      case "sym":
        this.layer = 2 === this.layer ? 0 : 2;
        this.sel = layerChars(this.layer).length + j;
        this.maybeDeghost(ctx);
        break;
      case "space":
        this.buffer += " ";
        this.showLast = false;
        break;
      case "del":
        this.buffer = this.buffer.slice(0, -1);
        this.showLast = false;
        break;
      case "ok":
        this.finish(ctx, this.buffer);
        return false;
    }
    return true;
  }

  finish(ctx, result) {
    this.onDone && this.onDone(result);
    ctx.nav.pop();
  }

  display() {
    if (!this.secret) return this.buffer;
    const n = this.buffer.length;
    if (!n) return "";
    // mask all but optionally the final typed char
    return "*".repeat(this.showLast ? n - 1 : n) + (this.showLast ? this.buffer[n - 1] : "");
  }

  draw(poco) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT);
    const W = poco.width,
      H = poco.height;

    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText(this.title, f, white, 16, (34 - f.height) >> 1);

    // entry field with a 1px box outline (Poco has no rectangle-outline call).
    // RIGHT keeps the right edge clear of the panel bezel.
    const RIGHT = 24;
    const shown = this.display() || " ";
    const bx = 14,
      by = 40,
      bw = W - bx - RIGHT,
      bh = f.height + 6;
    poco.fillRectangle(black, bx, by, bw, 1);
    poco.fillRectangle(black, bx, by + bh - 1, bw, 1);
    poco.fillRectangle(black, bx, by, 1, bh);
    poco.fillRectangle(black, bx + bw - 1, by, 1, bh);
    poco.drawText(shown, f, black, 16, 42);

    // character grid (right edge kept clear of the bezel)
    const margin = 8;
    const cw = ((W - margin - RIGHT) / COLS) | 0;
    const ch = f.height + 2;
    const gx = margin,
      gy = 78;
    const chars = layerChars(this.layer);
    const rows = Math.ceil(chars.length / COLS);
    for (let i = 0; i < chars.length; i++) {
      const x = gx + (i % COLS) * cw,
        y = gy + ((i / COLS) | 0) * ch;
      this.cell(poco, chars[i], x, y, cw, ch, i === this.sel, f, black, white);
    }

    // special keys on their own row, laid out by measured width
    const sy = gy + rows * ch + 8;
    let sx = margin;
    for (let j = 0; j < SPECIALS.length; j++) {
      const label = specialLabel(SPECIALS[j], this.layer);
      const w = poco.getTextWidth(label, f) + 14;
      this.cell(poco, label, sx, sy, w, ch, chars.length + j === this.sel, f, black, white);
      sx += w + 6;
    }

    poco.drawText("dial:type  orange:del  big:OK", f, black, 16, H - 2 * f.height - 12);
    poco.drawText("rotate:move  hold orange:cancel", f, black, 16, H - f.height - 8);
  }

  cell(poco, text, x, y, w, ch, on, f, black, white) {
    const tx = x + ((w - poco.getTextWidth(text, f)) >> 1);
    if (on) {
      poco.fillRectangle(black, x, y - 2, w, ch);
      poco.drawText(text, f, white, tx, y);
    } else {
      poco.drawText(text, f, black, tx, y);
    }
  }
}

export default KeyboardApp;
