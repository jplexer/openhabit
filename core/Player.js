/*
 * Player — streams audio off the SD card to the I2S amp.
 *
 *   WAV: PCM read in blocks straight to AudioOut.
 *   MP3: streamed frame-by-frame (sliding buffer + libmad) — NOT slurped into RAM, so
 *        large tracks work. The decoder downmixes to mono, which suits the mono amp.
 *
 * Output uses AudioOut.Async double-buffering: write a block, and when it has played,
 * produce + write the next. Audio runs on the I2S task so the UI loop keeps running
 * (the player screen doesn't redraw mid-playback, so the slow e-ink refresh can't
 * starve the audio queue). Volume is a digital attenuation (0..1) — the MAX98357A has
 * a fixed ~9dB gain, so hot 0dBFS files clip the speaker without it.
 */

import AudioOut from "embedded:io/audio/out";
import { File } from "file";
import Preference from "preference";
import MP3 from "mp3/decode";

const DOMAIN = "openhabit";
const DEFAULT_VOLUME = 60; // percent (UI scale)
const MAX_GAIN = 0.1; // UI 100% maps to this actual AudioOut volume — the amp's fixed
//                        gain is high, so anything above ~15% clips the speaker
const PUMPS = 3; // blocks kept in flight
const WAV_BLOCK = 4096; // bytes per WAV write
const MP3_BUF = 8192; // sliding input window
const MP3_FRAME = 1152 * 2; // max decoded bytes per frame (mono 16-bit)
const GUARD = MP3.BUFFER_GUARD; // libmad needs this many readable bytes past a frame
const MAX_FRAME = 1600; // largest MP3 frame we expect

const MP3_RATES = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
};

function fourCC(view, o) {
  return String.fromCharCode(
    view.getUint8(o),
    view.getUint8(o + 1),
    view.getUint8(o + 2),
    view.getUint8(o + 3),
  );
}

function parseWav(f) {
  f.position = 0;
  const head = new DataView(f.read(ArrayBuffer, 12));
  if ("RIFF" !== fourCC(head, 0) || "WAVE" !== fourCC(head, 8)) return null;
  let pos = 12,
    fmt;
  while (pos + 8 <= f.length) {
    f.position = pos;
    const ch = new DataView(f.read(ArrayBuffer, 8));
    const id = fourCC(ch, 0),
      size = ch.getUint32(4, true);
    pos += 8;
    if ("fmt " === id) {
      f.position = pos;
      const b = new DataView(f.read(ArrayBuffer, size));
      fmt = {
        audioFormat: b.getUint16(0, true),
        channels: b.getUint16(2, true),
        sampleRate: b.getUint32(4, true),
        bits: b.getUint16(14, true),
      };
    } else if ("data" === id) {
      if (!fmt) return null;
      return { ...fmt, dataOffset: pos, dataBytes: size };
    }
    pos += size + (size & 1);
  }
  return null;
}

function mp3Rate(buf, pos) {
  const ver = (buf[pos + 1] >> 3) & 3;
  const sr = (buf[pos + 2] >> 2) & 3;
  return (MP3_RATES[ver] && MP3_RATES[ver][sr]) || 44100;
}

class Player {
  // play(path, onDone) — onDone() fires when the file ends or playback is stopped.
  play(path, onDone) {
    this.onDone = onDone;
    this.playing = false;
    this.inFlight = 0;
    this.file = new File(path);
    this.fileLen = this.file.length;
    if (path.toLowerCase().endsWith(".mp3")) this.startMp3();
    else this.startWav();
  }

  volume() {
    const v = Preference.get(DOMAIN, "volume");
    const pct = undefined === v ? DEFAULT_VOLUME : v;
    return (pct / 100) * MAX_GAIN; // UI 0..100% → 0..0.15 actual
  }

  // ---- WAV ----
  startWav() {
    const w = parseWav(this.file);
    if (!w || 1 !== w.audioFormat) {
      this.cleanup();
      throw new Error("not PCM WAV");
    }
    this.file.position = w.dataOffset;
    this.remaining = w.dataBytes;
    this.next = () => this.nextWav();
    this.begin(w.sampleRate, w.channels, w.bits);
  }

  nextWav() {
    if (this.remaining <= 0) return null;
    let buf;
    try {
      buf = this.file.read(ArrayBuffer, Math.min(WAV_BLOCK, this.remaining));
    } catch (e) {
      this.remaining = 0;
      return null;
    }
    this.remaining -= buf.byteLength;
    return buf.byteLength ? buf : null;
  }

  // ---- MP3 (streamed) ----
  startMp3() {
    this.mp3 = new MP3();
    this.buf = new Uint8Array(MP3_BUF);
    this.filled = 0;
    this.pos = 0;
    this.eof = false;
    this.fillMp3();
    const info = MP3.scan(this.buf, this.pos, this.filled);
    if (!info) {
      this.cleanup();
      throw new Error("no MP3 frames");
    }
    this.next = () => this.nextMp3();
    this.begin(mp3Rate(this.buf, info.position), 1, 16);
  }

  fillMp3() {
    if (this.eof) return;
    const want = this.buf.length - GUARD - this.filled;
    const avail = this.fileLen - this.file.position;
    if (want <= 0) return;
    if (avail <= 0) {
      this.eof = true;
      this.buf.fill(0, this.filled, this.filled + GUARD); // guard for the last frame
      return;
    }
    const chunk = new Uint8Array(
      this.file.read(ArrayBuffer, Math.min(want, avail)),
    );
    this.buf.set(chunk, this.filled);
    this.filled += chunk.byteLength;
    if (this.file.position >= this.fileLen) {
      this.eof = true;
      this.buf.fill(0, this.filled, this.filled + GUARD);
    }
  }

  compactMp3() {
    if (this.pos === 0) return;
    this.buf.copyWithin(0, this.pos, this.filled);
    this.filled -= this.pos;
    this.pos = 0;
  }

  nextMp3() {
    for (;;) {
      if (!this.eof && this.filled - this.pos < MAX_FRAME + GUARD) {
        this.compactMp3();
        this.fillMp3();
      }
      const info = MP3.scan(this.buf, this.pos, this.filled);
      if (!info) {
        if (this.eof) return null;
        this.compactMp3();
        this.fillMp3();
        continue;
      }
      const start = info.position,
        len = info.length;
      if (start + len + GUARD > this.filled && !this.eof) {
        this.compactMp3();
        this.fillMp3();
        continue;
      }
      const out = new Uint8Array(MP3_FRAME);
      let consumed;
      try {
        consumed = this.mp3.decode(
          this.buf.subarray(start, start + len + GUARD),
          out,
        );
      } catch (e) {
        consumed = 0;
      }
      if (!consumed) {
        this.pos = start + 1; // resync past a bad frame
        if (this.eof && this.pos >= this.filled) return null;
        continue;
      }
      this.pos = start + consumed;
      const samples = out.samples | 0;
      if (!samples) continue;
      return out.subarray(0, samples * 2);
    }
  }

  // ---- common ----
  begin(sampleRate, channels, bits) {
    this.out = new AudioOut.Async({
      sampleRate,
      channels,
      bitsPerSample: bits,
    });
    this.out.volume = this.volume();
    this.out.start();
    this.playing = true;
    for (let i = 0; i < PUMPS; i++) this.pump();
  }

  pump() {
    if (!this.playing) return;
    let block;
    try {
      block = this.next();
    } catch (e) {
      block = null;
    }
    if (!block) {
      this.maybeDone();
      return;
    }
    this.inFlight++;
    this.out.write(block, () => {
      this.inFlight--;
      this.pump();
    });
  }

  maybeDone() {
    if (this.playing && this.inFlight <= 0) this.stop();
  }

  stop() {
    if (!this.playing && !this.out) return;
    this.playing = false;
    try {
      this.out?.stop();
    } catch (e) {}
    this.cleanup();
    const cb = this.onDone;
    this.onDone = undefined;
    cb?.();
  }

  cleanup() {
    try {
      this.out?.close();
    } catch (e) {}
    try {
      this.mp3?.close();
    } catch (e) {}
    try {
      this.file?.close();
    } catch (e) {}
    this.out = this.mp3 = this.file = this.buf = undefined;
  }
}

export default Player;
