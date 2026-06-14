const LONG_MS = 600;
const REBOOT_MS = 10000; // hold big + orange together this long → force reboot
const COUNTS_PER_DETENT = 4;

class Input {
  constructor() {
    const Digital = device.io.Digital;
    const mk = (pin) => new Digital({ pin, mode: Digital.InputPullUp });

    this.encoder = new device.peripheral.Encoder({});
    this.lastCount = this.encoder.read();

    this.buttons = {
      big: mk(device.pin.buttonBig),
      orange: mk(device.pin.buttonOrange),
      dial: mk(device.pin.encoderButton),
    };
    this.level = { big: 1, orange: 1, dial: 1 }; // 1 = released (pull-up)
    this.downAt = { big: 0, orange: 0, dial: 0 };
    this.longed = { big: false, orange: false, dial: false };
    this.chordAt = 0; // when big+orange first held together (0 = not)
    this.chordFired = false;
  }

  close() {
    this.encoder?.close?.();
    for (const name in this.buttons) this.buttons[name].close();
    this.encoder = this.buttons = undefined;
  }

  poll(now) {
    const events = [];

    // encoder: cumulative count -> whole detents since last poll
    const count = this.encoder.read();
    const detents = ((count - this.lastCount) / COUNTS_PER_DETENT) | 0;
    if (detents) {
      this.lastCount += detents * COUNTS_PER_DETENT;
      events.push({ type: "rotate", delta: detents });
    }

    // buttons: edge-detect press/release, time the hold for long-press
    for (const name in this.buttons) {
      const level = this.buttons[name].read(); // 0 = pressed
      const was = this.level[name];

      if (1 === was && 0 === level) {
        // just pressed
        this.downAt[name] = now;
        this.longed[name] = false;
      } else if (0 === was && 1 === level) {
        // just released
        if (!this.longed[name]) events.push({ type: "press", button: name });
      } else if (
        0 === level &&
        !this.longed[name] &&
        now - this.downAt[name] >= LONG_MS
      ) {
        this.longed[name] = true; // fire long-press once, mid-hold
        events.push({ type: "longpress", button: name });
      }
      this.level[name] = level;
    }

    // system chord: big + orange held together for REBOOT_MS → reboot (once)
    if (0 === this.level.big && 0 === this.level.orange) {
      if (0 === this.chordAt) this.chordAt = now;
      else if (!this.chordFired && now - this.chordAt >= REBOOT_MS) {
        this.chordFired = true;
        events.push({ type: "reboot" });
      }
    } else {
      this.chordAt = 0;
      this.chordFired = false;
    }

    return events;
  }
}

export default Input;
