/*
 * PlayerApp — "now playing" screen for an audio file off the SD card. Started by
 * FilesApp when a .wav is opened. dial/orange stops and returns; playback also
 * auto-returns when the file finishes.
 */

import App from "core/App";
import { font } from "core/assets";
import Player from "core/Player";

const FONT = "OpenSans-Regular-18";

class PlayerApp extends App {
  constructor(path, name) {
    super();
    this.path = path;
    this.name = name || path;
  }

  onMount() {
    this.player = new Player();
    this.started = false;
    this.finished = false;
    this.status = "playing";
    this.suppressDeghost = true; // no screen refresh while audio is streaming
  }

  onUnmount() {
    this.player?.stop();
    this.player = undefined;
  }

  onTick(now, ctx) {
    if (this.finished) {
      ctx.nav.pop();
      return false;
    }
    // start playback AFTER the first (blocking) render, so the ~0.5s e-ink update
    // doesn't starve the audio queue at the start
    if (!this.started) {
      this.started = true;
      try {
        this.player.play(this.path, () => {
          this.finished = true; // consumed next onTick → pop back to Files
        });
      } catch (e) {
        this.status = "can't play: " + e;
        this.player = undefined;
        return true; // failed before any audio — safe to redraw
      }
      return false; // screen already shows "playing"; don't force a redraw
    }
    return false;
  }

  onEvent(event, ctx) {
    if ("press" === event.type && ("dial" === event.button || "orange" === event.button)) {
      ctx.nav.pop(); // onUnmount stops playback
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
    poco.drawText("now playing", f, white, 16, (34 - f.height) >> 1);

    poco.drawText(this.name, f, black, 16, 60);
    poco.drawText(this.status, f, black, 16, 60 + f.height + 8);
    poco.drawText("dial/orange: stop", f, black, 16, H - f.height - 10);
  }
}

export default PlayerApp;
