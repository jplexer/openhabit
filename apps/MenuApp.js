import App from "core/App";
import { font } from "core/assets";

const FONT = "OpenSans-Regular-18";

class MenuApp extends App {
  constructor(items = []) {
    super();
    this.items = items;
    this.sel = 0;
  }

  onEvent(event, ctx) {
    const n = this.items.length;
    if ("rotate" === event.type && n) {
      this.sel = Math.max(0, Math.min(n - 1, this.sel + event.delta));
      return true;
    }
    if ("press" === event.type && "dial" === event.button) {
      this.items[this.sel]?.make && ctx.nav.push(this.items[this.sel].make());
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
      H = poco.height,
      lh = f.height + 10;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText("menu", f, white, 16, (34 - f.height) >> 1);

    let y = 44;
    for (let i = 0; i < this.items.length; i++) {
      if (i === this.sel) {
        // highlighted row: inverted
        poco.fillRectangle(black, 8, y - 3, W - 16, lh);
        poco.drawText(this.items[i].label, f, white, 20, y);
      } else {
        poco.drawText(this.items[i].label, f, black, 20, y);
      }
      y += lh;
    }
    poco.drawText("orange → back", f, black, 16, H - f.height - 10);
  }
}

export default MenuApp;
