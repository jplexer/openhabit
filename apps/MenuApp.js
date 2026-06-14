import App from "core/App";
import { font } from "core/assets";
import drawList from "core/list";

const FONT = "OpenSans-Regular-18";

class MenuApp extends App {
  constructor(items = [], title = "menu") {
    super();
    this.items = items;
    this.title = title;
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
      H = poco.height;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.fillRectangle(black, 0, 0, W, 34);
    poco.drawText(this.title, f, white, 16, (34 - f.height) >> 1);

    this.first = drawList(poco, {
      font: f,
      black,
      white,
      x: 8,
      width: W - 16,
      top: 40,
      bottom: H - f.height - 16,
      rowHeight: f.height + 10,
      count: this.items.length,
      sel: this.sel,
      first: this.first,
      drawRow: (i, x, ty, selected) =>
        poco.drawText(this.items[i].label, f, selected ? white : black, x + 12, ty),
    });
    poco.drawText("orange → back", f, black, 16, H - f.height - 10);
  }
}

export default MenuApp;
