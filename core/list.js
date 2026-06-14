/*
 * drawList — a reusable windowed (scrolling) vertical list for Poco screens.
 *
 * It keeps the selected row visible, draws only the rows that fit between `top` and
 * `bottom`, paints the selection highlight, and — when the list overflows — shows a
 * scrollbar thumb plus up/down arrows indicating there are more items above/below. Row
 * CONTENT is delegated to a `drawRow` callback so each caller can lay out its own text
 * (a plain label, or left+right columns, etc.).
 *
 *   drawRow(i, x, ty, selected, rowW)
 *     i        item index
 *     x        left edge of the row (same as opts.x)
 *     ty       text baseline y (already vertically centered in the row)
 *     selected whether this row is highlighted (pick white text if so)
 *     rowW     usable row width (excludes the scrollbar gutter)
 *
 * `first` (the top visible index) is stateful for stable scrolling: pass the value you
 * stored last time and save the returned value. Pass 0 (or undefined) on first draw.
 */

const EDGE = 24; // scrollbar/arrow centre, this far left of the region's right edge —
//                  kept large so the panel bezel doesn't hide it
const PAD = 16; // right reserve kept even without a scrollbar, so right-aligned row
//                 content (sizes, signal) also clears the bezel
const SB_W = 7; // scrollbar thumb width
const AR_H = 9; // arrow height
const AR_HALF = 6; // arrow half-base (width = 13)

// filled triangle (up = apex at top), 2px-tall bands so it reads on the e-ink
function arrow(poco, color, cx, topY, up) {
  for (let r = 0; r < AR_H; r++) {
    const t = up ? r / (AR_H - 1) : 1 - r / (AR_H - 1);
    const hw = Math.round(AR_HALF * t);
    poco.fillRectangle(color, cx - hw, topY + r, hw * 2 + 1, 2);
  }
}

export default function drawList(poco, o) {
  const f = o.font;
  const x = o.x ?? 8;
  const width = o.width;
  const top = o.top;
  const count = o.count;
  const sel = o.sel;
  const rh = o.rowHeight || f.height + 8;
  const rows = Math.max(1, Math.floor((o.bottom - top) / rh));

  // scroll the window so the selection stays visible
  let first = o.first | 0;
  if (sel < first) first = sel;
  else if (sel >= first + rows) first = sel - rows + 1;
  const maxFirst = Math.max(0, count - rows);
  first = Math.max(0, Math.min(first, maxFirst));

  const overflow = count > rows;
  const rowW = width - (overflow ? EDGE + AR_HALF + 6 : PAD);
  const ty = (rh - f.height) >> 1; // vertical centering offset within a row
  const last = Math.min(count, first + rows);
  for (let i = first; i < last; i++) {
    const y = top + (i - first) * rh;
    const selected = i === sel;
    if (selected) poco.fillRectangle(o.black, x, y, rowW, rh);
    o.drawRow(i, x, y + ty, selected, rowW);
  }

  if (overflow) {
    const bottom = o.bottom;
    const cx = x + width - EDGE; // inset from the right edge to clear the bezel
    const sbx = cx - (SB_W >> 1);

    // up/down arrows pinned to the top/bottom of the list region (only the direction
    // that has more items)
    if (first > 0) arrow(poco, o.black, cx, top, true);
    if (first + rows < count) arrow(poco, o.black, cx, bottom - AR_H, false);

    // thumb between the arrow zones
    const trackTop = top + AR_H + 3;
    const tH = bottom - AR_H - 3 - trackTop;
    if (tH > 6) {
      const thumbH = Math.max(8, ((rows / count) * tH) | 0);
      const thumbY = trackTop + (((first / maxFirst) * (tH - thumbH)) | 0);
      poco.fillRectangle(o.black, sbx, thumbY, SB_W, thumbH);
    }
  }

  return first;
}
