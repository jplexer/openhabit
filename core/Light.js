/*
 * Light — a single dimmable PWM light (LEDC via pins/pwm, 0..1023, active-high).
 *
 * Shared by the front backlight (core/Backlight) and the big light. The fade-UP is
 * synchronous so it beats the ~0.5s blocking e-ink render that follows an interaction
 * (a timer-driven fade gets starved by it); the fade-OUT runs on a timer for idle/off.
 * Brightness (5/25/50/75/100 %) is persisted under `key`.
 *
 * On/off policy lives in the owner: the front light auto-wakes and times out; the big
 * light is a manual toggle. The settings-preview interface (previewBegin/Set/Save/
 * Cancel) is the manual-light flavour — Backlight overrides it with a hold-based one.
 */

import Timer from "timer";
import PWM from "pins/pwm";
import Preference from "preference";

const DOMAIN = "openhabit";
const MAX = 1023; // pins/pwm is 10-bit
const STEP_MS = 20; // fade granularity
const SYNC_FADE_MS = 180; // synchronous fade (up / preview)
const OUT_FADE_MS = 800; // async fade-out

export default class Light {
  constructor(pin, key, defaultPct = 100) {
    this.pwm = new PWM({ pin });
    this.pwm.write(0);
    this.key = key;
    const p = Preference.get(DOMAIN, key);
    this.pct = undefined === p ? defaultPct : p;
    this.onLevel = this.levelFor(this.pct);
    this.level = 0; // current duty
    this.want = false; // desired on/off (manual toggle)
    this.prevWant = false; // saved across a settings preview
    this.outTimer = undefined; // async fade-out timer
  }

  levelFor(pct) {
    return Math.max(1, Math.round((MAX * pct) / 100));
  }

  get lit() {
    return this.level > 0;
  }

  // synchronous fade to a level — completes before the blocking render that follows
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

  // async fade to off (idle / toggle-off — nothing is rendering then)
  fadeOut() {
    if (this.outTimer || this.level <= 0) return;
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

  setBrightness(pct, persist) {
    this.pct = pct;
    this.onLevel = this.levelFor(pct);
    if (persist) Preference.set(DOMAIN, this.key, pct);
  }

  show() {
    this.fadeSync(this.onLevel); // display at current brightness (no want change)
  }
  on() {
    this.want = true;
    this.show();
  }
  off() {
    this.want = false;
    this.fadeOut();
  }
  toggle() {
    this.want ? this.off() : this.on();
  }

  // settings preview (manual flavour): turn on to preview, restore prior state on exit
  previewBegin() {
    this.prevWant = this.want;
    this.show();
  }
  previewSet(pct) {
    this.setBrightness(pct, false);
    this.show();
  }
  previewSave(pct) {
    this.setBrightness(pct, true);
    this.restore();
  }
  previewCancel(prevPct) {
    this.setBrightness(prevPct, false);
    this.restore();
  }
  restore() {
    if (this.prevWant) this.on();
    else this.off();
  }

  close() {
    this.stopFadeOut();
    this.pwm?.write?.(0);
    this.pwm?.close?.();
    this.pwm = undefined;
  }
}
