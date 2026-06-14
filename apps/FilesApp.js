/*
 * FilesApp — a minimal SD-card browser for testing the Files/SD integration.
 * Lists /sdcard/, walks into directories, and previews the first bytes of a file.
 *
 *   rotate   move selection
 *   dial     open directory / preview file
 *   orange   up a directory (or exit at the root)
 *   big      refresh
 *
 * Reachable from Settings. Errors (no card / mount failure) are shown, not thrown.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";
import { File, Iterator } from "file";
import PlayerApp from "apps/PlayerApp";

const FONT = "OpenSans-Regular-18";
const ROOT = "/sdcard/";
const PREVIEW = 256; // bytes shown in the file preview

function sizeStr(n) {
  if (n < 1024) return n + "B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + "K";
  return (n / 1048576).toFixed(1) + "M";
}

function tail(s, max) {
  return s.length <= max ? s : ".." + s.slice(s.length - (max - 2));
}

class FilesApp extends App {
  onMount() {
    if (undefined === this.path) this.path = ROOT;
    this.mode = "list";
    this.readDir();
  }

  readDir() {
    this.sel = 0;
    this.first = 0;
    this.error = undefined;
    this.entries = [];
    try {
      for (const e of new Iterator(this.path)) {
        // hide dotfiles and the FAT/Windows volume-metadata folder
        if ("." === e.name[0] || "System Volume Information" === e.name) continue;
        this.entries.push({ name: e.name, dir: undefined === e.length, size: e.length || 0 });
      }
      this.entries.sort((a, b) =>
        a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1,
      );
    } catch (e) {
      this.error = String(e);
    }
  }

  enter(ctx) {
    const e = this.entries[this.sel];
    if (!e) return false;
    if (e.dir) {
      this.path += e.name + "/";
      this.readDir();
      return true;
    }
    // audio files → play; everything else → text preview
    const lower = e.name.toLowerCase();
    if (lower.endsWith(".wav") || lower.endsWith(".mp3")) {
      ctx.nav.push(new PlayerApp(this.path + e.name, e.name));
      return false;
    }
    this.viewName = e.name;
    this.viewSize = e.size;
    this.viewText = this.preview(this.path + e.name, e.size);
    this.mode = "view";
    return true;
  }

  preview(path, size) {
    try {
      const n = Math.min(size, PREVIEW);
      const f = new File(path);
      const s = n > 0 ? f.read(String, n) : "";
      f.close();
      let out = "";
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        out += 10 === c || 13 === c ? " " : c >= 32 && c < 127 ? s[i] : ".";
      }
      return out;
    } catch (e) {
      return "read error: " + e;
    }
  }

  up(ctx) {
    if (this.path === ROOT) {
      ctx.nav.pop();
      return false;
    }
    const p = this.path.slice(0, -1); // drop trailing /
    this.path = p.slice(0, p.lastIndexOf("/") + 1);
    this.readDir();
    return true;
  }

  onEvent(event, ctx) {
    if ("view" === this.mode) {
      if ("press" === event.type && ("orange" === event.button || "dial" === event.button)) {
        this.mode = "list";
        return true;
      }
      return false;
    }
    if ("rotate" === event.type && this.entries.length) {
      this.sel = Math.max(0, Math.min(this.entries.length - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) return this.enter(ctx);
    if ("press" === event.type && "big" === event.button) {
      this.readDir();
      return true;
    }
    if ("press" === event.type && "orange" === event.button) return this.up(ctx);
    return false;
  }

  draw(poco) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT);
    const W = poco.width,
      H = poco.height,
      lh = f.height + 2;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);

    if ("view" === this.mode) {
      poco.drawText(tail(this.viewName, 28), f, white, 16, (34 - f.height) >> 1);
      poco.drawText(`size: ${sizeStr(this.viewSize)}`, f, black, 12, 42);
      let y = 42 + lh + 4;
      const cpl = 34; // approx chars per line
      for (let i = 0; i < this.viewText.length && y < H - f.height - 10; i += cpl) {
        poco.drawText(this.viewText.substr(i, cpl), f, black, 12, y);
        y += lh;
      }
      poco.drawText("orange/dial: back", f, black, 16, H - f.height - 8);
      return;
    }

    // list mode
    poco.drawText("files", f, white, 16, (34 - f.height) >> 1);
    poco.drawText(tail(this.path, 30), f, black, 12, 40);

    const top = 40 + lh + 2;
    const bottom = H - f.height - 10;
    if (this.error) {
      poco.drawText("SD error:", f, black, 12, top);
      poco.drawText(tail(this.error, 34), f, black, 12, top + lh);
      poco.drawText("no card? wrong pins/pullups?", f, black, 12, top + 2 * lh);
    } else if (!this.entries.length) {
      poco.drawText("(empty)", f, black, 12, top);
    } else {
      this.first = drawList(poco, {
        font: f,
        black,
        white,
        x: 8,
        width: W - 16,
        top,
        bottom,
        rowHeight: f.height + 6,
        count: this.entries.length,
        sel: this.sel,
        first: this.first,
        drawRow: (i, x, ty, selected, rowW) => {
          const e = this.entries[i];
          const col = selected ? white : black;
          const right = e.dir ? "<dir>" : sizeStr(e.size);
          poco.drawText((e.dir ? "/" : " ") + e.name, f, col, x + 8, ty);
          poco.drawText(right, f, col, x + rowW - 8 - poco.getTextWidth(right, f), ty);
        },
      });
    }
    poco.drawText("dial open · orange up · big refresh", f, black, 16, H - f.height - 8);
  }
}

export default FilesApp;
