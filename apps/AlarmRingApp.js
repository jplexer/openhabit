/*
 * AlarmRingApp — full-screen alarm. Pushed by the Alarms service when an alarm fires.
 * Loops the alarm's sound (if any); big = snooze, orange/dial = dismiss. Suppresses the
 * idle de-ghost so the screen refresh can't starve the looping audio.
 */

import App from "core/App";
import { font } from "core/assets";
import Player from "core/Player";

const FONT = "OpenSans-Regular-18";
const BIG_FONT = "OpenSans-Semibold-120";
const pad = (n) => (n < 10 ? "0" : "") + n;

class AlarmRingApp extends App {
  constructor(alarm) {
    super();
    this.alarm = alarm;
  }

  onMount(ctx) {
    this.suppressDeghost = true;
    this.ringing = true;
    this.started = false;
    ctx.backlight && ctx.backlight.wake(Date.now());
  }

  onTick() {
    // start sound after the first (blocking) render so it doesn't starve the queue
    if (!this.started) {
      this.started = true;
      this.startSound();
    }
    return false;
  }

  startSound() {
    if (!this.ringing || !this.alarm.sound) return;
    this.player = new Player();
    try {
      this.player.play(this.alarm.sound, () => {
        this.player = undefined;
        this.startSound(); // loop until dismissed
      });
    } catch (e) {
      this.player = undefined; // missing/bad file → silent (sunrise still woke you)
    }
  }

  onUnmount() {
    this.ringing = false;
    this.player && this.player.stop();
    this.player = undefined;
  }

  onEvent(event, ctx) {
    if ("press" === event.type && "big" === event.button) {
      ctx.alarms && ctx.alarms.snooze();
      ctx.nav.pop();
      return false;
    }
    if ("press" === event.type && ("orange" === event.button || "dial" === event.button)) {
      ctx.alarms && ctx.alarms.dismiss();
      ctx.nav.pop();
      return false;
    }
    return false;
  }

  draw(poco) {
    const black = poco.makeColor(0, 0, 0),
      white = poco.makeColor(255, 255, 255);
    const f = font(FONT),
      big = font(BIG_FONT);
    const W = poco.width,
      H = poco.height;
    const time = `${pad(this.alarm.hour)}:${pad(this.alarm.minute)}`;
    poco.fillRectangle(white, 0, 0, W, H);
    poco.drawText("ALARM", f, black, (W - poco.getTextWidth("ALARM", f)) >> 1, 16);
    poco.drawText(time, big, black, (W - poco.getTextWidth(time, big)) >> 1, (((H - f.height) - big.height) >> 1) + 8);
    poco.drawText("big: snooze   orange: stop", f, black, 16, H - f.height - 10);
  }
}

export default AlarmRingApp;
