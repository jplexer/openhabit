/*
 * Net — the background networking service. Owns the Wi-Fi radio, time sync, and
 * credential/timezone persistence. Injected once as `ctx.net` (see main.js) so the
 * connection survives leaving the Wi-Fi screen and time keeps syncing on its own.
 *
 * Apps are thin UIs over this: they only READ the plain fields below (in onTick, to
 * detect change) and call the methods. Wi-Fi/SNTP callbacks fire OUTSIDE the Manager
 * poll loop, so they ONLY mutate fields here — never touch poco/nav.
 *
 * Time model: the RTC holds TRUE UTC. A DST-aware offset for the selected IANA zone
 * (offsetMinutes(), via core/tz + core/zones) is applied only when DISPLAYING time
 * (see ClockApp). SNTP writes UTC; manual set subtracts the offset before writing
 * (see SetTimeApp).
 *
 * Status (connection only): "offline" | "connecting" | "associating" | "online" | "failed"
 * Scanning is tracked separately by `scanning` / `scanGen`.
 */

import WiFi from "wifi";
import SNTP from "sntp";
import Time from "time";
import Preference from "preference";
import Timer from "timer";
import { offsetMinutes as tzOffset } from "core/tz";
import { posixFor } from "core/zones";

const DOMAIN = "openhabit";
const CONNECT_TIMEOUT_MS = 15000; // give up on a connect attempt after this
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-sync the clock every 6h
const SNTP_HOSTS = ["pool.ntp.org", "time.google.com", "time.cloudflare.com"];

class Net {
  constructor({ rtc } = {}) {
    this.rtc = rtc;

    this.status = "offline"; // connection state machine
    this.synced = false; // SNTP has set the clock at least once this session
    this.ssid = undefined; // ssid of the current/last attempt
    this.ip = undefined;
    this.lastError = undefined; // "auth" | "timeout" | "link" | "sntp"

    this.scanning = false;
    this.scanResults = []; // [{ssid, rssi, secured, saved}] deduped, best RSSI
    this.scanGen = 0; // bumps per scan; UIs detect "results replaced"

    this.suspendReconnect = false; // true while the Wi-Fi screen is foreground
    this.syncing = false;
    this.zoneName = undefined; // selected IANA zone, e.g. "Europe/Berlin"
    this.zonePosix = undefined; // its POSIX TZ string (for core/tz)

    this.link = undefined; // current `new WiFi(...)` instance (observer + connect)
    this.sntp = undefined;
    this.connTimer = 0; // connect-timeout timer id
    this.syncTimer = 0; // 6h repeat timer id
    this.associated = false; // saw "connect" during this attempt (handshake reached)
    this.target = undefined; // {ssid, password, save, auto} of the current attempt
    this.candidates = undefined; // remaining saved nets to try during auto-connect
  }

  // ---- lifecycle ---------------------------------------------------------

  boot() {
    const zone = Preference.get(DOMAIN, "zone");
    if (zone) {
      this.zoneName = zone;
      this.zonePosix = posixFor(zone);
    }
    WiFi.mode = WiFi.Mode.station;
    this.syncTimer = Timer.repeat(() => {
      if ("online" === this.status) this.syncTime();
    }, SYNC_INTERVAL_MS);
    this.autoConnect();
  }

  close() {
    this.closeLink();
    this.clearConnectTimeout();
    if (this.syncTimer) {
      Timer.clear(this.syncTimer);
      this.syncTimer = 0;
    }
    this.sntp = undefined;
  }

  // ---- persistence -------------------------------------------------------

  savedNetworks() {
    const raw = Preference.get(DOMAIN, "networks");
    if (!raw) return [];
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  saveNetwork(ssid, password) {
    const nets = this.savedNetworks().filter((n) => n.ssid !== ssid);
    nets.push({ ssid, password });
    Preference.set(DOMAIN, "networks", JSON.stringify(nets));
  }

  forget(ssid) {
    Preference.set(
      DOMAIN,
      "networks",
      JSON.stringify(this.savedNetworks().filter((n) => n.ssid !== ssid)),
    );
    if (Preference.get(DOMAIN, "lastSsid") === ssid)
      Preference.delete(DOMAIN, "lastSsid");
    for (const r of this.scanResults) if (r.ssid === ssid) r.saved = false;
    if (this.target && this.target.ssid === ssid) this.target = undefined;
    if (this.ssid === ssid && "offline" !== this.status) {
      this.closeLink();
      this.clearConnectTimeout();
      WiFi.disconnect();
      this.status = "offline";
      this.ssid = undefined;
    }
  }

  setZone(name) {
    this.zoneName = name;
    this.zonePosix = posixFor(name);
    Preference.set(DOMAIN, "zone", name);
  }

  // minutes to add to a UTC instant (ms) to get local wall time, DST-aware
  offsetMinutes(utcMs) {
    return this.zonePosix ? tzOffset(this.zonePosix, utcMs) : 0;
  }

  // ---- connecting --------------------------------------------------------

  autoConnect() {
    if (this.suspendReconnect) return;
    const saved = this.savedNetworks();
    if (!saved.length) {
      this.status = "offline";
      return;
    }
    const last = Preference.get(DOMAIN, "lastSsid");
    // try lastSsid first, then the rest in order
    this.candidates = saved
      .slice()
      .sort((a, b) => (a.ssid === last ? -1 : b.ssid === last ? 1 : 0));
    this.tryNext();
  }

  tryNext() {
    if (!this.candidates || !this.candidates.length) {
      if ("online" !== this.status) this.status = "failed";
      return;
    }
    const n = this.candidates.shift();
    this.connect({ ssid: n.ssid, password: n.password, save: false, auto: true });
  }

  // ssid required; password optional (open network); save persists on success;
  // auto marks a boot/auto-connect attempt (falls through to the next candidate).
  connect({ ssid, password, save, auto } = {}) {
    if (!ssid) return;
    this.scanGen++; // invalidate any in-flight scan (can't scan + connect)
    this.scanning = false;
    this.closeLink();
    this.target = { ssid, password, save, auto };
    this.ssid = ssid;
    this.ip = undefined;
    this.lastError = undefined;
    this.associated = false;
    this.status = "connecting";
    trace(`net: connecting to "${ssid}"\n`);
    try {
      this.link = new WiFi({ ssid, password }, (msg, value) =>
        this.onWiFi(msg, value),
      );
    } catch (e) {
      this.status = "failed";
      this.lastError = "link";
      trace(`net: connect error ${e}\n`);
      return;
    }
    this.armConnectTimeout();
  }

  onWiFi(msg, value) {
    switch (msg) {
      case WiFi.connected: // "connect" — associated, handshake reached
        this.associated = true;
        this.status = "associating";
        break;
      case WiFi.gotIP: // "gotIP"
        this.clearConnectTimeout();
        this.ip = value;
        this.status = "online";
        this.lastError = undefined;
        trace(`net: online "${this.ssid}" @ ${value}\n`);
        this.onConnected();
        break;
      case WiFi.disconnected: // "disconnect"
        this.onDisconnect(value);
        break;
      // "lostIP": link may recover; leave status as-is
    }
  }

  onConnected() {
    if (this.target) {
      if (this.target.save) this.saveNetwork(this.target.ssid, this.target.password);
      Preference.set(DOMAIN, "lastSsid", this.ssid);
    }
    this.candidates = undefined;
    this.syncTime();
  }

  onDisconnect(reason) {
    if ("online" === this.status) {
      // dropped after being online — try to get it back unless paused
      this.status = "offline";
      trace(`net: disconnected (${reason})\n`);
      if (!this.suspendReconnect && this.target)
        this.connect({ ssid: this.target.ssid, password: this.target.password });
      return;
    }
    // failed during a connect attempt. If we associated first, the 4-way handshake
    // failed → almost always a bad password. Otherwise it's a link/range problem.
    this.clearConnectTimeout();
    this.lastError = this.associated ? "auth" : "link";
    this.status = "failed";
    trace(`net: connect failed "${this.ssid}" (${this.lastError}, reason ${reason})\n`);
    if (this.target && this.target.auto) this.tryNext();
  }

  armConnectTimeout() {
    this.clearConnectTimeout();
    this.connTimer = Timer.set(() => {
      this.connTimer = 0;
      if ("connecting" === this.status || "associating" === this.status) {
        this.closeLink();
        this.lastError = "timeout";
        this.status = "failed";
        trace(`net: connect timeout "${this.ssid}"\n`);
        if (this.target && this.target.auto) this.tryNext();
      }
    }, CONNECT_TIMEOUT_MS);
  }

  clearConnectTimeout() {
    if (this.connTimer) {
      Timer.clear(this.connTimer);
      this.connTimer = 0;
    }
  }

  closeLink() {
    if (this.link) {
      try {
        this.link.close();
      } catch (e) {}
      this.link = undefined;
    }
  }

  // ---- foreground gate (Wi-Fi screen) ------------------------------------

  beginInteractive() {
    this.suspendReconnect = true;
  }

  endInteractive() {
    this.suspendReconnect = false;
    if (
      "online" !== this.status &&
      "connecting" !== this.status &&
      "associating" !== this.status
    )
      this.autoConnect();
  }

  // ---- scanning ----------------------------------------------------------

  // onAp() is called when a new ssid is added; onDone() when the scan ends.
  scan(onAp, onDone) {
    if ("connecting" === this.status || "associating" === this.status) {
      this.closeLink();
      this.clearConnectTimeout();
      this.status = "offline";
    }
    const gen = ++this.scanGen;
    this.scanResults = [];
    this.scanning = true;
    const saved = this.savedNetworks();
    WiFi.scan({}, (ap) => {
      if (gen !== this.scanGen) return; // stale generation
      if (ap) {
        if (!ap.ssid) return; // hidden
        const existing = this.scanResults.find((r) => r.ssid === ap.ssid);
        if (existing) {
          if (ap.rssi > existing.rssi) existing.rssi = ap.rssi;
          return;
        }
        this.scanResults.push({
          ssid: ap.ssid,
          rssi: ap.rssi,
          secured: !!ap.authentication && "none" !== ap.authentication,
          saved: !!saved.find((n) => n.ssid === ap.ssid),
        });
        onAp && onAp();
      } else {
        this.scanResults.sort((a, b) => b.rssi - a.rssi);
        this.scanning = false;
        onDone && onDone();
      }
    });
  }

  // ---- time sync ---------------------------------------------------------

  syncTime() {
    if ("online" !== this.status || this.syncing) return;
    this.syncing = true;
    let host = 0;
    this.sntp = new SNTP({ host: SNTP_HOSTS[0] }, (msg, value) => {
      if (SNTP.time === msg) {
        this.applyTime(value);
        this.syncing = false;
        this.sntp = undefined; // SNTP closed itself before this callback
        return;
      }
      if (SNTP.error === msg) {
        host++;
        if (host < SNTP_HOSTS.length) return SNTP_HOSTS[host]; // retry next host
        this.syncing = false;
        this.sntp = undefined;
        this.lastError = "sntp";
        trace(`net: sntp failed (${value})\n`);
        return; // give up until the next interval
      }
      // SNTP.retry: keep waiting
    });
  }

  applyTime(sec) {
    Time.set(sec); // system clock (UTC)
    if (this.rtc) this.rtc.time = sec * 1000; // RTC stores true UTC ms
    this.synced = true;
    this.lastError = undefined;
    trace(`net: time synced ${sec}\n`);
  }

  // Manual clock set (SetTimeApp). utcMs is true UTC; the caller has already
  // subtracted the timezone offset from the local time the user entered.
  setClock(utcMs) {
    if (this.rtc) this.rtc.time = utcMs;
    Time.set(Math.floor(utcMs / 1000));
    this.synced = true;
  }
}

export default Net;
