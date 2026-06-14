import Poco from "commodetto/Poco";
import Timer from "timer";
import { font } from "core/assets";

const POLL_MS = 80; // input + tick cadence
const SETTLE_MS = 10000; // idle time after the last update before an auto de-ghost
const DEGHOST_AFTER = 5; // min partials accumulated before an auto de-ghost bothers (0 = never auto)
const BOOT_MODE = "full"; // waveform for the boot/first-screen full refreshes
const DEGHOST_MODE = "fast"; // waveform for de-ghosting
const FONT = "OpenSans-Regular-18";

class Manager {
  constructor(services = {}) {
    this.poco = new Poco(screen, { displayListLength: 4096 });
    this.stack = [];
    this.partials = 0; // no-flash updates since the last clean refresh (= ghosting built up)
    this.lastUpdate = 0; // timestamp of the last panel update
    this.booted = false; // has the first app screen been drawn (full) yet?
    screen.configure({ mode: BOOT_MODE });

    // every app sees this; nav + deghost are wired back to this manager
    this.ctx = Object.assign(
      {
        poco: this.poco,
        screen,
        deghost: () => this.deghost(),
        nav: {
          push: (app) => this.push(app),
          pop: () => this.pop(),
          replace: (app) => this.replace(app),
          home: () => this.home(),
        },
      },
      services,
    );
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  push(app) {
    this.top?.onUnmount?.(this.ctx);
    this.stack.push(app);
    app.onMount?.(this.ctx);
    this.render();
  }
  replace(app) {
    this.stack.pop()?.onUnmount?.(this.ctx);
    this.stack.push(app);
    app.onMount?.(this.ctx);
    this.render();
  }
  pop() {
    if (this.stack.length <= 1) return;
    this.stack.pop().onUnmount?.(this.ctx);
    this.top.onMount?.(this.ctx); // reveal the screen underneath
    this.render();
  }
  home() {
    while (this.stack.length > 1) this.stack.pop().onUnmount?.(this.ctx);
    this.top.onMount?.(this.ctx);
    this.render();
  }

  // Boot screen shown before the first app is pushed. A full refresh, so the
  // panel starts from a known image regardless of what was on it.
  splash(title = "openhabit", subtitle = "starting…") {
    const poco = this.poco,
      f = font(FONT);
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const W = poco.width,
      H = poco.height;
    screen.configure({ refresh: true });
    poco.begin();
    poco.fillRectangle(white, 0, 0, W, H);
    poco.drawText(
      title,
      f,
      black,
      (W - poco.getTextWidth(title, f)) >> 1,
      (H >> 1) - f.height,
    );
    if (subtitle)
      poco.drawText(
        subtitle,
        f,
        black,
        (W - poco.getTextWidth(subtitle, f)) >> 1,
        (H >> 1) + 4,
      );
    poco.end();
    this.partials = 0;
  }

  start(input) {
    this.input = input;
    Timer.repeat(() => this.loop(), POLL_MS);
  }

  loop() {
    const now = Date.now();
    if (!this.top) return;

    // alarms run before anything else — a fired alarm pushes its ring screen, which
    // then becomes the top app for the rest of this loop
    this.ctx.alarms?.tick(now, this.ctx);

    const top = this.top;
    const events = this.input.poll(now);

    // backlight: any interaction fades it up; it fades out when idle. Done before any
    // early return so every event counts (incl. the big snooze button press).
    const backlight = this.ctx.backlight;
    if (backlight) {
      if (events.length) backlight.wake(now);
      backlight.tick(now);
    }

    // system gestures are handled here, before any app sees the input
    for (const event of events) {
      if ("reboot" === event.type) return this.reboot();
      if ("longpress" === event.type && "orange" === event.button)
        return this.deghost();
    }

    let dirty = false;
    for (const event of events)
      if (top.onEvent?.(event, this.ctx)) dirty = true;

    // an event may have navigated away; that screen already rendered itself
    if (this.top !== top) return;

    if (top.onTick?.(now, this.ctx)) dirty = true;
    if (dirty) return this.render();

    // idle: clear ghosting once the image has settled and enough has built up
    // (apps can opt out, e.g. during audio playback where a refresh would block and
    // starve the audio queue)
    if (
      DEGHOST_AFTER > 0 &&
      !top.suppressDeghost &&
      this.partials >= DEGHOST_AFTER &&
      now - this.lastUpdate >= SETTLE_MS
    )
      this.deghost();
  }

  // Draw the top app. The first screen is a clean full refresh; everything after
  // is a no-flash partial (ghosting accumulates until a de-ghost clears it).
  render() {
    if (!this.booted) {
      screen.configure({ refresh: true });
      this.booted = true;
    } else {
      this.partials++;
    }
    const poco = this.poco;
    poco.begin();
    this.top.draw(poco, this.ctx);
    poco.end();
    this.lastUpdate = Date.now();
  }

  deghost() {
    screen.configure({ mode: DEGHOST_MODE });
    screen.refresh(); // re-display the current image with the clean waveform
    this.partials = 0;
    this.lastUpdate = Date.now();
  }

  reboot() {
    trace("openhabit: reboot chord — restarting\n");
    System.restart(); // esp_restart(); never returns
  }
}

export default Manager;
