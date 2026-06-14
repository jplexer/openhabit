/*
 * Alarms — background alarm service. Stores alarms in Preference, and on each Manager
 * poll checks the local time to (a) ramp the big light as a "sunrise" in the minutes
 * before a sunrise alarm, and (b) fire the alarm at its time. Firing pushes the ring
 * screen (the factory is injected so this core module doesn't import an app).
 *
 * Alarm: { hour, minute, days[7] (Sun..Sat), enabled, sunrise, sound }. No day set =
 * one-time (fires the next time it's reached, then disables itself).
 *
 * Time model: RTC holds UTC; the zone offset (ctx.net) is applied for local time.
 */

import Preference from "preference";

const DOMAIN = "openhabit";
const SUNRISE_MIN = 15; // big light ramps over the 15 min before a sunrise alarm
const SNOOZE_MIN = 9;

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function defaultAlarm() {
  return {
    hour: 7,
    minute: 0,
    days: [false, false, false, false, false, false, false],
    enabled: true,
    sunrise: false,
    sound: "",
  };
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first listing

// short human description of an alarm's repeat days
export function repeatSummary(a) {
  const on = a.days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (!on.length) return "once";
  if (7 === on.length) return "daily";
  const set = on.join(",");
  if ("1,2,3,4,5" === set) return "weekdays";
  if ("0,6" === set) return "weekends";
  return WEEK_ORDER.filter((i) => a.days[i]).map((i) => DOW[i]).join(" ");
}

class Alarms {
  constructor({ rtc, net, bigLight, makeRing } = {}) {
    this.rtc = rtc;
    this.net = net;
    this.bigLight = bigLight;
    this.makeRing = makeRing; // (alarm) => AlarmRingApp
    this.alarms = [];
    this.ringing = undefined; // the alarm currently ringing
    this.snoozeAlarm = undefined;
    this.snoozeUntil = 0; // local seconds-of-day for a snoozed re-fire
    this.sunriseActive = false;
    this.lastFireMinute = -1; // absolute UTC minute we last fired at (de-dupe)
  }

  boot() {
    const raw = Preference.get(DOMAIN, "alarms");
    if (raw) {
      try {
        this.alarms = JSON.parse(raw) || [];
      } catch (e) {
        this.alarms = [];
      }
    }
  }

  save() {
    Preference.set(DOMAIN, "alarms", JSON.stringify(this.alarms));
  }

  localDate() {
    const t = this.rtc && this.rtc.time;
    if (undefined === t) return undefined;
    const off = (this.net ? this.net.offsetMinutes(t) : 0) * 60000;
    return new Date(t + off);
  }

  tick(now, ctx) {
    const d = this.localDate();
    if (!d) return;
    const dow = d.getUTCDay();
    const hh = d.getUTCHours(),
      mm = d.getUTCMinutes(),
      ss = d.getUTCSeconds();
    const secOfDay = (hh * 60 + mm) * 60 + ss;

    this.updateSunrise(secOfDay, dow);

    if (this.ringing) return; // wait for dismiss/snooze

    // snoozed re-fire
    if (this.snoozeAlarm && this.snoozeUntil && secOfDay >= this.snoozeUntil) {
      const a = this.snoozeAlarm;
      this.snoozeAlarm = undefined;
      this.snoozeUntil = 0;
      this.fire(a, ctx);
      return;
    }

    // scheduled alarms — fire once on the matching minute
    const absMinute = Math.floor(this.rtc.time / 60000);
    if (absMinute === this.lastFireMinute) return;
    for (const a of this.alarms) {
      if (!a.enabled || a.hour !== hh || a.minute !== mm) continue;
      const oneTime = !a.days.some(Boolean);
      if (!oneTime && !a.days[dow]) continue;
      this.lastFireMinute = absMinute;
      if (oneTime) {
        a.enabled = false;
        this.save();
      }
      this.fire(a, ctx);
      return;
    }
  }

  updateSunrise(secOfDay, dow) {
    if (this.ringing) return;
    let frac = 0;
    for (const a of this.alarms) {
      if (!a.enabled || !a.sunrise) continue;
      const oneTime = !a.days.some(Boolean);
      if (!oneTime && !a.days[dow]) continue;
      const until = (a.hour * 60 + a.minute) * 60 - secOfDay;
      if (until > 0 && until <= SUNRISE_MIN * 60) {
        const f = 1 - until / (SUNRISE_MIN * 60);
        if (f > frac) frac = f;
      }
    }
    if (frac > 0) {
      this.sunriseActive = true;
      this.bigLight && this.bigLight.dim(Math.round(frac * 100));
    } else if (this.sunriseActive) {
      this.sunriseActive = false;
      this.bigLight && this.bigLight.off();
    }
  }

  fire(alarm, ctx) {
    this.ringing = alarm;
    this.sunriseActive = false;
    if (alarm.sunrise && this.bigLight) this.bigLight.dim(100); // full on at the alarm
    ctx.backlight && ctx.backlight.wake(Date.now());
    if (this.makeRing) ctx.nav.push(this.makeRing(alarm));
  }

  snooze() {
    if (!this.ringing) return;
    const d = this.localDate();
    const secOfDay = d ? (d.getUTCHours() * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds() : 0;
    this.snoozeAlarm = this.ringing;
    this.snoozeUntil = secOfDay + SNOOZE_MIN * 60;
    this.ringing = undefined;
    this.bigLight && this.bigLight.off();
  }

  dismiss() {
    this.ringing = undefined;
    this.snoozeAlarm = undefined;
    this.snoozeUntil = 0;
    this.bigLight && this.bigLight.off();
  }
}

export default Alarms;
