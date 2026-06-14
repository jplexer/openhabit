/*
 * WiFiApp — scan for and join Wi-Fi networks. The radio itself lives in the background
 * service ctx.net; this is just a UI over it. On mount we pause auto-reconnect
 * (beginInteractive) and start a scan; the list is read live from ctx.net.scanResults.
 *
 *   rotate            move selection
 *   dial              join the selected network
 *                       open      → connect
 *                       saved     → connect with the stored password
 *                       new+secured → ask for the password (KeyboardApp)
 *   long-press dial   forget the selected (saved) network
 *   big               rescan
 *   orange            back
 *
 * Password entry uses the "modal result" idiom: KeyboardApp calls onDone(pw) (pw=null
 * if cancelled) then pops; we stash it and consume it in our re-entered onMount.
 */

import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";
import KeyboardApp from "apps/KeyboardApp";

const FONT = "OpenSans-Regular-18";

function statusLine(net) {
  switch (net.status) {
    case "connecting":
    case "associating":
      return `connecting to ${net.ssid}…`;
    case "online":
      return `online: ${net.ssid}`;
    case "failed":
      return "auth" === net.lastError
        ? "wrong password"
        : "timeout" === net.lastError
          ? "connect timed out"
          : "connect failed";
    default:
      return net.scanning ? "scanning…" : "select a network";
  }
}

class WiFiApp extends App {
  onMount(ctx) {
    ctx.net.beginInteractive();

    // returning from the password keyboard?
    if (undefined !== this.pendingPassword) {
      const pw = this.pendingPassword;
      this.pendingPassword = undefined;
      if (null !== pw && undefined !== this.target)
        ctx.net.connect({ ssid: this.target, password: pw, save: true });
      this.target = undefined;
      return; // don't rescan
    }

    if (!this.started) {
      this.started = true;
      this.sel = 0;
      this.first = 0;
      ctx.net.scan();
    }
    this.lastKey = this.key(ctx);
  }

  onUnmount(ctx) {
    ctx.net.endInteractive();
  }

  rows(ctx) {
    return ctx.net.scanResults;
  }

  key(ctx) {
    const net = ctx.net;
    return [
      net.scanGen,
      net.scanResults.length,
      net.status,
      net.scanning,
      net.lastError || "",
      this.sel,
    ].join("/");
  }

  onTick(now, ctx) {
    const rows = this.rows(ctx);
    if (this.sel >= rows.length) this.sel = Math.max(0, rows.length - 1);
    const key = this.key(ctx);
    if (key === this.lastKey) return false;
    this.lastKey = key;
    return true;
  }

  onEvent(event, ctx) {
    const rows = this.rows(ctx);
    if ("rotate" === event.type && rows.length) {
      this.sel = Math.max(0, Math.min(rows.length - 1, this.sel + event.delta));
      return true;
    }
    if ("longpress" === event.type && "dial" === event.button) {
      const ap = rows[this.sel];
      if (ap && ctx.net.savedNetworks().find((n) => n.ssid === ap.ssid)) {
        ctx.net.forget(ap.ssid);
        return true;
      }
      return false;
    }
    if ("press" === event.type && "dial" === event.button)
      return this.join(ctx, rows[this.sel]);
    if ("press" === event.type && "big" === event.button) {
      this.sel = 0;
      this.first = 0;
      ctx.net.scan();
      return true;
    }
    if ("press" === event.type && "orange" === event.button) {
      ctx.nav.pop();
      return false;
    }
    return false;
  }

  join(ctx, ap) {
    if (!ap) return false;
    if (!ap.secured) {
      ctx.net.connect({ ssid: ap.ssid, save: true });
      return true;
    }
    const saved = ctx.net.savedNetworks().find((n) => n.ssid === ap.ssid);
    if (saved) {
      ctx.net.connect({ ssid: ap.ssid, password: saved.password, save: false });
      return true;
    }
    // secured + unknown → collect the password, then connect+save on return
    this.target = ap.ssid;
    ctx.nav.push(
      new KeyboardApp({
        title: ap.ssid,
        secret: true,
        onDone: (pw) => {
          this.pendingPassword = pw;
        },
      }),
    );
    return false; // keyboard renders itself
  }

  draw(poco, ctx) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT);
    const W = poco.width,
      H = poco.height,
      lh = f.height + 8;
    const net = ctx.net;
    const rows = net.scanResults;
    const connected = "online" === net.status ? net.ssid : undefined;

    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("wi-fi", f, white, 16, (34 - f.height) >> 1);
    poco.drawText(statusLine(net), f, black, 16, 42);

    const top = 42 + lh;
    const bottom = H - f.height - 10;
    if (!rows.length) {
      poco.drawText(net.scanning ? "scanning…" : "no networks found", f, black, 20, top);
    } else {
      this.first = drawList(poco, {
        font: f,
        black,
        white,
        x: 8,
        width: W - 16,
        top,
        bottom,
        rowHeight: lh,
        count: rows.length,
        sel: this.sel,
        first: this.first,
        drawRow: (i, x, ty, selected, rowW) => {
          const ap = rows[i];
          const mark = ap.ssid === connected ? ">" : ap.saved ? "+" : " ";
          const right = `${ap.secured ? "* " : ""}${ap.rssi}`;
          const col = selected ? white : black;
          poco.drawText(`${mark} ${ap.ssid}`, f, col, x + 8, ty);
          poco.drawText(right, f, col, x + rowW - 8 - poco.getTextWidth(right, f), ty);
        },
      });
    }

    poco.drawText("dial join · big rescan · orange back", f, black, 16, bottom);
  }
}

export default WiFiApp;
