/*
 * SoundPickApp — pick an alarm sound from /sdcard/sounds/alarm/ (recursing into
 * subfolders), or "(none)". Names show without the file extension (subfolder kept as a
 * prefix); the stored value is the full path. Returns it via onDone (modal-result
 * idiom) then pops. orange cancels.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";
import { Iterator } from "file";

const FONT = "OpenSans-Regular-18";
const DIR = "/sdcard/sounds/alarm/";
const MAX_DEPTH = 4;

function stripExt(name) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

class SoundPickApp extends App {
  constructor(onDone) {
    super();
    this.onDone = onDone;
  }

  onMount() {
    this.sel = 0;
    this.first = 0;
    this.error = undefined;
    this.items = [null]; // index 0 = "(none)"; others = { path, label }
    try {
      this.scan(DIR, "", 0);
    } catch (e) {
      this.error = String(e);
    }
    this.items.sort((a, b) => (a && b ? a.label.localeCompare(b.label) : a ? 1 : -1));
  }

  scan(dir, rel, depth) {
    let entries;
    try {
      entries = [...new Iterator(dir)]; // fully read (closes the dir) before recursing
    } catch (e) {
      if ("" === rel) this.error = String(e);
      return;
    }
    for (const e of entries) {
      if ("." === e.name[0] || "System Volume Information" === e.name) continue;
      if (undefined === e.length) {
        if (depth < MAX_DEPTH) this.scan(dir + e.name + "/", rel + e.name + "/", depth + 1);
        continue;
      }
      const l = e.name.toLowerCase();
      if (l.endsWith(".wav") || l.endsWith(".mp3"))
        this.items.push({ path: dir + e.name, label: rel + stripExt(e.name) });
    }
  }

  onEvent(event, ctx) {
    if ("rotate" === event.type) {
      this.sel = Math.max(0, Math.min(this.items.length - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      const it = this.items[this.sel];
      this.onDone && this.onDone(it ? it.path : "");
      ctx.nav.pop();
      return false;
    }
    if ("press" === event.type && "orange" === event.button) {
      ctx.nav.pop(); // cancel — leave the sound unchanged
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
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("alarm sound", f, white, 16, (34 - f.height) >> 1);

    if (this.error) {
      poco.drawText("no sounds found", f, black, 12, 50);
      poco.drawText("(put .wav/.mp3 in", f, black, 12, 50 + f.height + 6);
      poco.drawText(" /sdcard/sounds/alarm/)", f, black, 12, 50 + 2 * (f.height + 6));
    } else {
      this.first = drawList(poco, {
        font: f,
        black,
        white,
        x: 8,
        width: W - 16,
        top: 40,
        bottom: H - f.height - 10,
        rowHeight: f.height + 8,
        count: this.items.length,
        sel: this.sel,
        first: this.first,
        drawRow: (i, x, ty, selected) => {
          const it = this.items[i];
          poco.drawText(it ? it.label : "(none)", f, selected ? white : black, x + 12, ty);
        },
      });
    }
    poco.drawText("dial: choose   orange: cancel", f, black, 16, H - f.height - 8);
  }
}

export default SoundPickApp;
