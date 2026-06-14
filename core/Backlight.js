/*
 * Backlight — fades the display front light (lightFront, GPIO18) up on any
 * interaction and back down after a few seconds of inactivity.
 *
 * The e-ink render blocks the single JS thread for ~0.5s, which would starve a
 * timer-driven fade (the light wouldn't move until the screen finished). So the
 * fade-UP runs SYNCHRONOUSLY here — it completes before the render that follows the
 * interaction, so the light responds immediately. The idle fade-OUT runs on a timer,
 * since nothing is rendering then.
 *
 * Brightness (5/25/50/75/100 %) is a persisted setting (LightingApp); the active level
 * is ON = MAX * pct/100. Uses LEDC PWM (pins/pwm, 0..1023, active-high). lightBig is a
 * separate light and is intentionally left untouched here.
 */

import Timer from "timer";
import PWM from "pins/pwm";
import Preference from "preference";

const DOMAIN = "openhabit";
const MAX = 1023; // pins/pwm is 10-bit
const DEFAULT_PCT = 100;
const STEP_MS = 20; // fade granularity
const SYNC_FADE_MS = 180; // synchronous fades (wake / preview) — kept short
const OUT_FADE_MS = 800; // async idle fade-out
const TIMEOUT_MS = 8000; // idle time before fading out

class Backlight {
  constructor() {
    this.pwm = new PWM({ pin: device.pin.lightFront });
    this.pwm.write(0);
    const p = Preference.get(DOMAIN, "brightness");
    this.pct = undefined === p ? DEFAULT_PCT : p;
    this.onLevel = this.levelFor(this.pct);
    this.level = 0; // current duty
    this.last = 0; // last interaction time
    this.held = false; // stay lit (e.g. while the Lighting screen previews)
    this.outTimer = undefined; // async fade-out timer
  }

  levelFor(pct) {
    return Math.max(1, Math.round((MAX * pct) / 100));
  }

  // light up on interaction — synchronous so it beats the blocking render
  wake(now) {
    this.last = now;
    this.fadeSync(this.onLevel);
  }

  // called every poll: start the (async) fade-out once idle past the timeout
  tick(now) {
    if (this.held || this.outTimer || this.level <= 0) return;
    if (now - this.last >= TIMEOUT_MS) this.startFadeOut();
  }

  // change brightness; `persist` saves it. Shows the result immediately (synchronous)
  // so the Lighting screen previews each level the instant it's selected.
  setBrightness(pct, persist) {
    this.pct = pct;
    this.onLevel = this.levelFor(pct);
    if (persist) Preference.set(DOMAIN, "brightness", pct);
    this.last = Date.now();
    this.fadeSync(this.onLevel);
  }

  // keep the light on regardless of the idle timeout (Lighting screen foreground)
  setHold(on) {
    this.held = on;
    this.last = Date.now();
    if (on) this.fadeSync(this.onLevel);
  }

  // Blocking fade to a level over ~SYNC_FADE_MS. Used for the up/preview path; cancels
  // any in-flight async fade-out first.
  fadeSync(target) {
    this.stopFadeOut();
    if (this.level === target) return;
    const up = target > this.level;
    const steps = Math.max(1, Math.round(SYNC_FADE_MS / STEP_MS));
    const inc = Math.max(1, Math.ceil(Math.abs(target - this.level) / steps));
    while (this.level !== target) {
      this.level += up ? inc : -inc;
      if ((up && this.level > target) || (!up && this.level < target)) this.level = target;
      this.pwm.write(this.level);
      if (this.level !== target) Timer.delay(STEP_MS);
    }
  }

  startFadeOut() {
    const inc = Math.max(1, Math.round((MAX * STEP_MS) / OUT_FADE_MS));
    this.outTimer = Timer.repeat(() => {
      this.level -= inc;
      if (this.level <= 0) {
        this.level = 0;
        this.stopFadeOut();
      }
      this.pwm.write(this.level);
    }, STEP_MS);
  }

  stopFadeOut() {
    if (this.outTimer) {
      Timer.clear(this.outTimer);
      this.outTimer = undefined;
    }
  }

  close() {
    this.stopFadeOut();
    this.pwm?.write?.(0);
    this.pwm?.close?.();
    this.pwm = undefined;
  }
}

export default Backlight;
