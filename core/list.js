/*
 * drawList — a reusable windowed (scrolling) vertical list for Poco screens.
 *
 * It keeps the selected row visible, draws only the rows that fit between `top` and
 * `bottom`, paints the selection highlight, and shows a scrollbar thumb when the list
 * is taller than the window. Row CONTENT is delegated to a `drawRow` callback so each
 * caller can lay out its own text (a plain label, or left+right columns, etc.).
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

const SB_W = 6; // scrollbar width
const SB_GAP = 4; // gap between rows and scrollbar

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
  const rowW = width - (overflow ? SB_W + SB_GAP : 0);
  const ty = (rh - f.height) >> 1; // vertical centering offset within a row
  const last = Math.min(count, first + rows);
  for (let i = first; i < last; i++) {
    const y = top + (i - first) * rh;
    const selected = i === sel;
    if (selected) poco.fillRectangle(o.black, x, y, rowW, rh);
    o.drawRow(i, x, y + ty, selected, rowW);
  }

  if (overflow) {
    const trackH = rows * rh;
    const sbx = x + width - SB_W;
    const thumbH = Math.max(10, ((rows / count) * trackH) | 0);
    const thumbY = top + (((first / maxFirst) * (trackH - thumbH)) | 0);
    poco.fillRectangle(o.black, sbx, thumbY, SB_W, thumbH);
  }

  return first;
}
