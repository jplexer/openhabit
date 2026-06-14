/*
 * Backlight — the display FRONT light (lightFront, GPIO18). Fades up on any
 * interaction and fades out after a few seconds idle. Driven by the Manager poll loop
 * (wake() on input, tick() every poll). The dimming/fade/brightness mechanics live in
 * core/Light; this adds the front light's auto-on + idle-timeout policy.
 *
 * The big light (lightBig) is a separate core/Light instance with its own manual
 * toggle and settings — see main.js / ClockApp.
 */

import Light from "core/Light";

const TIMEOUT_MS = 8000; // idle time before fading out

class Backlight {
  constructor() {
    this.light = new Light(device.pin.lightFront, "brightness", 100);
    this.last = 0;
    this.held = false; // suspend the idle timeout (e.g. while previewing in settings)
  }

  get pct() {
    return this.light.pct;
  }

  // light up on interaction (synchronous fade, beats the blocking render)
  wake(now) {
    this.last = now;
    this.light.show();
  }

  // fade out once idle past the timeout
  tick(now) {
    if (this.held || this.light.outTimer || !this.light.lit) return;
    if (now - this.last >= TIMEOUT_MS) this.light.fadeOut();
  }

  // settings preview (front flavour): hold the light on so the idle timeout doesn't
  // fade it mid-preview; release on save/cancel.
  previewBegin() {
    this.held = true;
    this.last = Date.now();
    this.light.show();
  }
  previewSet(pct) {
    this.light.setBrightness(pct, false);
    this.light.show();
  }
  previewSave(pct) {
    this.light.setBrightness(pct, true);
    this.light.show();
    this.release();
  }
  previewCancel(prevPct) {
    this.light.setBrightness(prevPct, false);
    this.light.show();
    this.release();
  }
  release() {
    this.held = false;
    this.last = Date.now();
  }

  close() {
    this.light.close();
  }
}

export default Backlight;
