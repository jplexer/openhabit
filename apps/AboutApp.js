import App from "core/App";
import { font } from "core/assets";

const FONT = "OpenSans-Regular-18";

class AboutApp extends App {
  onMount() {
    this.adc = new device.io.Analog(device.Analog.default);
    this.raw = this.adc.read();
  }
  onUnmount() {
    this.adc?.close();
    this.adc = undefined;
  }

  onTick() {
    const r = this.adc.read();
    if (Math.abs(r - this.raw) < 256) return false; // ignore ADC noise
    this.raw = r;
    return true;
  }

  onEvent(event, ctx) {
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
    poco.drawText("about", f, white, 16, (34 - f.height) >> 1);
    poco.drawText("openhabit firmware", f, black, 16, 50);
    poco.drawText(`battery adc: ${this.raw}`, f, black, 16, 50 + f.height + 8);
    poco.drawText("orange → back", f, black, 16, H - f.height - 10);
  }
}

export default AboutApp;
